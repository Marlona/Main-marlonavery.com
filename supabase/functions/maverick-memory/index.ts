/**
 * maverick-memory — Maverick's long-term memory API (vector store).
 *
 * Same security posture as maverick-agent: verify_jwt + pinned to Marlon's
 * account. Embeddings come from the Supabase edge runtime's built-in
 * gte-small model (384 dims) — no external API or key involved. Purely
 * internal: reads and writes public.maverick_memories only.
 *
 * Actions:
 *   remember — { content, kind?, source?, metadata? } → embed + insert
 *   recall   — { query, count?, min_similarity? }     → similarity search
 *   list     — { limit? }                             → newest memories
 *   forget   — { id }                                 → delete one memory
 *
 * Phase 2's maverick-chat calls remember/recall inside its loop; until then
 * the dashboard (or this function directly) is the interface.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OWNER_EMAIL = 'hi@marlonavery.com';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGINS = new Set([
	'https://marlonavery.com',
	'https://www.marlonavery.com',
	'https://staging.marlonavery.com',
	'http://localhost:4321',
	'http://localhost:4399',
]);

const corsHeaders = (origin: string | null) => ({
	'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://marlonavery.com',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Content-Type': 'application/json',
});

// Built-in embedding model; mean_pool + normalize → unit vectors, so cosine
// distance in match_maverick_memories behaves.
declare const Supabase: { ai: { Session: new (model: string) => { run(input: string, opts: Record<string, unknown>): Promise<number[]> } } };
const embedder = new Supabase.ai.Session('gte-small');
const embed = (text: string) => embedder.run(text, { mean_pool: true, normalize: true });

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const KINDS = ['fact', 'preference', 'decision', 'person', 'project_context', 'conversation_summary'];

async function remember(body: { content?: string; kind?: string; source?: string; metadata?: Record<string, unknown> }) {
	const content = body.content?.trim();
	if (!content) throw new Error('remember needs non-empty content');
	if (content.length > 4000) throw new Error('memory too long — store the essence, not the transcript');
	const { data, error } = await db
		.from('maverick_memories')
		.insert({
			content,
			embedding: await embed(content),
			kind: KINDS.includes(body.kind ?? '') ? body.kind : 'fact',
			source: body.source ?? 'manual',
			metadata: body.metadata ?? {},
		})
		.select('id,content,kind,source,created_at')
		.single();
	if (error) throw new Error(error.message);
	return data;
}

async function recall(body: { query?: string; count?: number; min_similarity?: number }) {
	const query = body.query?.trim();
	if (!query) throw new Error('recall needs a query');
	const { data, error } = await db.rpc('match_maverick_memories', {
		query_embedding: await embed(query),
		match_count: Math.min(body.count ?? 8, 25),
		min_similarity: body.min_similarity ?? 0.45,
	});
	if (error) throw new Error(error.message);
	return data;
}

async function list(body: { limit?: number }) {
	const { data, error } = await db
		.from('maverick_memories')
		.select('id,content,kind,source,created_at')
		.order('created_at', { ascending: false })
		.limit(Math.min(body.limit ?? 20, 100));
	if (error) throw new Error(error.message);
	return data;
}

async function forget(body: { id?: string }) {
	if (!body.id) throw new Error('forget needs an id');
	const { error } = await db.from('maverick_memories').delete().eq('id', body.id);
	if (error) throw new Error(error.message);
	return { forgotten: body.id };
}

Deno.serve(async (req: Request) => {
	const headers = corsHeaders(req.headers.get('origin'));
	if (req.method === 'OPTIONS') return new Response('ok', { headers });
	if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });

	const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	const { data: userData } = await createClient(SUPABASE_URL, SERVICE_ROLE_KEY).auth.getUser(jwt);
	if (userData?.user?.email !== OWNER_EMAIL) {
		return new Response(JSON.stringify({ error: 'This studio is for MA.' }), { status: 403, headers });
	}

	try {
		const body = await req.json().catch(() => ({}));
		const action = body.action as string;
		const result =
			action === 'remember' ? await remember(body)
			: action === 'recall' ? await recall(body)
			: action === 'list' ? await list(body)
			: action === 'forget' ? await forget(body)
			: null;
		if (result === null) {
			return new Response(JSON.stringify({ error: `Unknown action "${action}"` }), { status: 400, headers });
		}
		return new Response(JSON.stringify({ ok: true, result }), { headers });
	} catch (err) {
		console.error('maverick-memory error:', err);
		return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }), {
			status: 500,
			headers,
		});
	}
});
