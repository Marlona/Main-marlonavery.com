// submit-inquiry — public form endpoint for marlonavery.com.
//
// verify_jwt is DISABLED on purpose: this receives anonymous visitor form
// submissions, which cannot carry a Supabase JWT. Layered protection instead:
//   1. Server-enforced Origin allow-list (browsers always send Origin on POST;
//      requests without an allowed Origin are rejected outright).
//   2. Per-IP rate limiting (3 per 10 min, 10 per day, hashed IPs only).
//   3. Honeypot field — bots that fill it get a fake success and no row.
//   4. Timing check — forms submitted faster than a human can type are stored
//      flagged as spam and never emailed.
//   5. Link-count heuristic — link-stuffed messages are flagged the same way.
// Payload validation with hard size caps; inserts use the service role, which
// never leaves this function; reads require Marlon's session (RLS).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
	'https://marlonavery.com',
	'https://www.marlonavery.com',
	'https://staging.marlonavery.com',
	'http://localhost:4321',
	'http://localhost:4399',
]);

const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_WINDOW_MAX = 3;
const RATE_DAY_MAX = 10;
const MIN_FILL_MS = 2500; // faster than any human fills a booking form

const corsHeaders = (origin: string | null) => ({
	'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://marlonavery.com',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'content-type',
	Vary: 'Origin',
});

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null);

const sha256 = async (input: string) => {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req: Request) => {
	const origin = req.headers.get('origin');
	const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' };

	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
	if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });

	// Browsers always send Origin on a cross-site (or fetch) POST — a missing or
	// unknown Origin means this didn't come from the site. Reject server-side;
	// CORS headers alone only protect browsers, not scripts.
	if (!origin || !ALLOWED_ORIGINS.has(origin)) {
		return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers });
	}

	let body: Record<string, unknown>;
	try {
		body = await req.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
	}

	// Honeypot: real visitors never fill this. Pretend success for bots.
	if (typeof body.website === 'string' && body.website.length > 0) {
		return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
	}

	const supabase = createClient(
		Deno.env.get('SUPABASE_URL')!,
		Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
	);

	// --- Per-IP rate limit (hashed — raw IPs are never stored) ---
	const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();
	const ipHash = await sha256(`inquiry:${ip}`);
	const now = new Date();
	const today = now.toISOString().slice(0, 10);

	const { data: throttle } = await supabase
		.from('inquiry_throttle')
		.select('hits, window_start, day_hits, day_start')
		.eq('ip_hash', ipHash)
		.maybeSingle();

	let hits = 1;
	let windowStart = now.toISOString();
	let dayHits = 1;
	if (throttle) {
		const inWindow = now.getTime() - new Date(throttle.window_start).getTime() < RATE_WINDOW_MS;
		hits = inWindow ? throttle.hits + 1 : 1;
		windowStart = inWindow ? throttle.window_start : windowStart;
		dayHits = throttle.day_start === today ? throttle.day_hits + 1 : 1;
		if (hits > RATE_WINDOW_MAX || dayHits > RATE_DAY_MAX) {
			return new Response(JSON.stringify({ error: 'too many requests — please try again later' }), {
				status: 429,
				headers,
			});
		}
	}
	await supabase.from('inquiry_throttle').upsert({
		ip_hash: ipHash,
		hits,
		window_start: windowStart,
		day_hits: dayHits,
		day_start: today,
	});

	// --- Validation ---
	const intent = str(body.intent, 40);
	const email = str(body.email, 200);
	const name = str(body.name, 120);
	const organization = str(body.organization, 200);
	const sourcePage = str(body.source_page, 200);
	const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
	const elapsedMs = typeof body.elapsed_ms === 'number' ? body.elapsed_ms : null;

	if (!intent) return new Response(JSON.stringify({ error: 'intent required' }), { status: 400, headers });
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
		return new Response(JSON.stringify({ error: 'valid email required' }), { status: 400, headers });
	if (JSON.stringify(answers).length > 8000)
		return new Response(JSON.stringify({ error: 'answers too large' }), { status: 400, headers });

	// --- Spam heuristics: store flagged, never email, tell the bot it worked ---
	let spamReason: string | null = null;
	if (elapsedMs !== null && elapsedMs < MIN_FILL_MS) spamReason = 'filled too fast';
	const prose = [name, organization, JSON.stringify(answers)].join(' ');
	const linkCount = (prose.match(/https?:\/\//gi) ?? []).length;
	if (linkCount > 2) spamReason = spamReason ? `${spamReason}; link-stuffed` : 'link-stuffed';

	const { data: row, error } = await supabase
		.from('inquiries')
		.insert({
			intent,
			name,
			email,
			organization,
			answers,
			source_page: sourcePage,
			spam: spamReason !== null,
			spam_reason: spamReason,
		})
		.select('id')
		.single();

	if (error) {
		console.error('insert failed', error);
		return new Response(JSON.stringify({ error: 'storage failed' }), { status: 500, headers });
	}

	// Forward by email when Resend is configured; storage already succeeded,
	// so email failures degrade gracefully. Spam-flagged rows are never emailed.
	const resendKey = Deno.env.get('RESEND_API_KEY');
	if (resendKey && spamReason === null) {
		const lines = [
			`Intent: ${intent}`,
			`Name: ${name ?? '—'}`,
			`Email: ${email}`,
			`Organization: ${organization ?? '—'}`,
			`Page: ${sourcePage ?? '—'}`,
			'',
			...Object.entries(answers as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`),
			'',
			`Stored as inquiry ${row.id}`,
		];
		try {
			const res = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					from: Deno.env.get('INQUIRY_FROM') ?? 'Marlon Avery Site <onboarding@resend.dev>',
					to: ['hi@marlonavery.com'],
					reply_to: email,
					subject: `[marlonavery.com] ${intent} inquiry from ${name ?? email}`,
					text: lines.join('\n'),
				}),
			});
			if (res.ok) {
				await supabase.from('inquiries').update({ emailed: true }).eq('id', row.id);
			} else {
				console.error('resend failed', res.status, await res.text());
			}
		} catch (e) {
			console.error('resend error', e);
		}
	}

	return new Response(JSON.stringify({ ok: true, id: row.id }), { status: 200, headers });
});
