import { openSql } from './db';
import type { AppEnv } from './runtime';

const OWNER_EMAIL = 'hi@marlonavery.com';
const ACTION = 'inquiry';
const MAX_BODY_BYTES = 65_536;

type InquiryBody = {
  intent: string;
  name?: string;
  email: string;
  organization?: string;
  answers: Record<string, string>;
  source_page?: string;
  website?: string;
  elapsed_ms?: number;
  turnstile_token?: string;
};

type TurnstileResult = { success?: boolean; action?: string; hostname?: string };

const responseHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const json = (origin: string, body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: responseHeaders(origin) });

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

function allowedOrigins(env: AppEnv): ReadonlySet<string> {
  if (env.ENVIRONMENT === 'production') {
    return new Set(['https://marlonavery.com', 'https://www.marlonavery.com']);
  }
  if (env.ENVIRONMENT === 'staging') return new Set(['https://staging.marlonavery.com']);
  return new Set(['http://localhost:4321', 'http://127.0.0.1:4321']);
}

async function boundedInquiryJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function isInquiryBody(value: unknown): value is InquiryBody {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as Partial<InquiryBody>;
  return typeof body.intent === 'string' && body.intent.trim().length > 0 &&
    typeof body.email === 'string' && body.email.includes('@') &&
    body.answers !== null && typeof body.answers === 'object' && !Array.isArray(body.answers);
}

export async function verifyTurnstile(request: Request, env: AppEnv, token: unknown): Promise<boolean> {
  const hostnames = new Set((env.TURNSTILE_HOSTNAMES ?? '').split(',').map((item) => item.trim()).filter(Boolean));
  if (!env.TURNSTILE_SECRET || typeof token !== 'string' || token.length === 0 || token.length > 2048 || hostnames.size === 0) return false;

  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') ?? '',
      }),
    });
    if (!result.ok) return false;
    const outcome: TurnstileResult = await result.json();
    return outcome.success === true && outcome.action === ACTION && typeof outcome.hostname === 'string' && hostnames.has(outcome.hostname);
  } catch {
    return false;
  }
}

async function deliverInquiryEmail(env: AppEnv, id: string, body: InquiryBody): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  const lines = Object.entries(body.answers).map(([key, value]) => `${key}: ${value}`).join('\n');
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Maverick <inquiries@marlonavery.com>',
      to: [OWNER_EMAIL],
      reply_to: body.email,
      subject: `[marlonavery.com] ${body.intent} inquiry from ${body.name ?? body.email}`,
      text: `Name: ${body.name ?? '—'}\nEmail: ${body.email}\nOrganization: ${body.organization ?? '—'}\nIntent: ${body.intent}\n\n${lines}`,
    }),
  });
  if (!sent.ok) {
    console.error(JSON.stringify({ message: 'inquiry email failed', inquiryId: id, status: sent.status }));
    return;
  }
  const sql = openSql(env);
  try {
    await sql`update inquiries set emailed = true where id = ${id}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function handleInquiry(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response> {
  const origin = request.headers.get('Origin') ?? '';
  if (!allowedOrigins(env).has(origin)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin) });
  if (request.method !== 'POST') return json(origin, { error: 'method not allowed' }, 405);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json(origin, { error: 'request too large' }, 413);
  const parsed = await boundedInquiryJson(request);
  if (!isInquiryBody(parsed)) return json(origin, { error: 'intent, email, and answers are required' }, 400);
  if (typeof parsed.website === 'string' && parsed.website.trim()) return json(origin, { ok: true });
  if (!(await verifyTurnstile(request, env, parsed.turnstile_token))) return json(origin, { error: 'verification failed — reload and try again' }, 403);

  const sql = openSql(env);
  try {
    const ipHash = await sha256(request.headers.get('CF-Connecting-IP') ?? 'unknown');
    const [throttle] = await sql`
      insert into inquiry_throttle (ip_hash) values (${ipHash})
      on conflict (ip_hash) do update set
        hits = case when now() - inquiry_throttle.window_start < interval '10 minutes' then inquiry_throttle.hits + 1 else 1 end,
        window_start = case when now() - inquiry_throttle.window_start < interval '10 minutes' then inquiry_throttle.window_start else now() end,
        day_hits = case when inquiry_throttle.day_start = current_date then inquiry_throttle.day_hits + 1 else 1 end,
        day_start = current_date
      returning hits, day_hits`;
    if (Number(throttle.hits) > 3 || Number(throttle.day_hits) > 10) return json(origin, { error: 'Too many requests — try again later.' }, 429);

    let spamReason: string | null = null;
    if (typeof parsed.elapsed_ms === 'number' && parsed.elapsed_ms >= 0 && parsed.elapsed_ms < 2500) spamReason = 'filled too fast';
    const answerText = JSON.stringify(parsed.answers);
    if (!spamReason && (answerText.match(/https?:\/\//g) ?? []).length > 2) spamReason = 'link-stuffed';

    const [row] = await sql`
      insert into inquiries (intent, name, email, organization, answers, source_page, spam, spam_reason)
      values (${parsed.intent}, ${parsed.name ?? null}, ${parsed.email}, ${parsed.organization ?? null},
        ${sql.json(parsed.answers)}, ${parsed.source_page ?? null}, ${spamReason !== null}, ${spamReason})
      returning id`;
    if (!spamReason) {
      ctx.waitUntil(deliverInquiryEmail(env, String(row.id), parsed).catch((error) => {
        console.error(JSON.stringify({
          message: 'inquiry email failed',
          inquiryId: String(row.id),
          reason: error instanceof Error ? error.message : 'unknown',
        }));
      }));
    }
    return json(origin, { ok: true, id: row.id });
  } catch (error) {
    console.error(JSON.stringify({ message: 'inquiry persistence failed', reason: error instanceof Error ? error.message : 'unknown' }));
    return json(origin, { error: 'Unable to save inquiry.' }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
