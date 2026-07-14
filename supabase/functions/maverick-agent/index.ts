/**
 * maverick-agent — the Command Center's AI layer (Phase 1).
 *
 * Deployed with verify_jwt=true AND pinned to Marlon's account below: only an
 * authenticated hi@marlonavery.com session can invoke it. Holds the OpenRouter
 * key (a static site can't keep secrets) and performs INTERNAL actions only —
 * per the approval guardrail, no email, calendar, money, or any external
 * communication ever happens here. Future external actions must dispatch from
 * an `approved` approval_queue row, never directly.
 *
 * Actions:
 *   daily_briefing — fast profile; reads DB, upserts daily_briefings for today
 *   (affirmations moved to maverick-elevate — the Elevate coaching engine)
 *   weekly_review  — reasoning profile; drafts this week's weekly_reviews row
 *
 * Secrets: OPENROUTER_API_KEY (required), MODEL_FAST / MODEL_REASONING /
 * MODEL_WRITING (optional overrides for the OpenRouter model slugs).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OWNER_EMAIL = 'hi@marlonavery.com';
const TIME_ZONE = 'America/New_York';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

const MODEL_PROFILES = {
	fast: Deno.env.get('MODEL_FAST') ?? 'anthropic/claude-haiku-4.5',
	reasoning: Deno.env.get('MODEL_REASONING') ?? 'anthropic/claude-sonnet-5',
	writing: Deno.env.get('MODEL_WRITING') ?? 'anthropic/claude-sonnet-5',
} as const;

/**
 * Explicit routing, decided at the call-site — no meta-model picks models.
 * Fallback chains stay inside the Claude family (voice + output-format
 * consistency); provider prefs prefer Anthropic direct and exclude any host
 * that trains on prompts. See docs/maverick-phase2.md → Model routing.
 */
const FALLBACKS: Record<keyof typeof MODEL_PROFILES, string[]> = {
	fast: ['anthropic/claude-sonnet-4.5'],
	reasoning: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.5'],
	writing: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.5'],
};

const routeFor = (profile: keyof typeof MODEL_PROFILES) => ({
	models: [MODEL_PROFILES[profile], ...FALLBACKS[profile].filter((m) => m !== MODEL_PROFILES[profile])],
	provider: { order: ['Anthropic'], data_collection: 'deny' },
});

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

/** Today as YYYY-MM-DD in Marlon's timezone (never UTC — see the events off-by-one lesson). */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());

/** Monday of the current week, YYYY-MM-DD, in Marlon's timezone. */
const weekStart = () => {
	const d = new Date(`${today()}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
	return d.toISOString().slice(0, 10);
};

const daysAgo = (n: number) => {
	const d = new Date(`${today()}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
};

async function callModel(profile: keyof typeof MODEL_PROFILES, system: string, user: string): Promise<string> {
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://marlonavery.com',
			'X-Title': 'Maverick Command Center',
		},
		body: JSON.stringify({
			...routeFor(profile),
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: user },
			],
		}),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body?.error?.message ?? `OpenRouter error ${res.status}`);
	const text = body?.choices?.[0]?.message?.content;
	if (typeof text !== 'string' || !text.trim()) throw new Error('OpenRouter returned an empty response');
	return text.trim();
}

/** Models love to wrap JSON in fences — strip them before parsing. */
const parseJson = (raw: string) => {
	const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
	return JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
};

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Built-in embeddings for the nightly distillation — same gte-small model as
// maverick-memory, so vectors are comparable across the two functions.
declare const Supabase: { ai: { Session: new (model: string) => { run(input: string, opts: Record<string, unknown>): Promise<number[]> } } };
const embedder = new Supabase.ai.Session('gte-small');
const embed = (text: string) => embedder.run(text, { mean_pool: true, normalize: true });

/** True if a near-identical memory already exists (dedup guard shared with maverick-memory). */
async function isDuplicateMemory(embedding: number[]): Promise<boolean> {
	const { data } = await db.rpc('match_maverick_memories', { query_embedding: embedding, match_count: 1, min_similarity: 0.9 });
	return (data ?? []).length > 0;
}

const audit = (entry: { observed: string; recommended: string; action_taken: string; action_type: string; related_id?: string }) =>
	db.from('audit_log').insert({ ...entry, approved: true });

async function gatherContext() {
	const [tasks, projects, engagements, revenue, checkins, inquiries] = await Promise.all([
		db.from('tasks').select('title,status,priority,due_date,pillar,impact_score,urgency_score')
			.neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(40),
		db.from('projects').select('name,pillar,status,priority,next_action,deadline')
			.in('status', ['active', 'waiting', 'stalled']),
		db.from('engagements').select('event_name,event_date,status,fee,balance_due,follow_up_needed,prep_status')
			.not('status', 'in', '("completed","lost")'),
		db.from('revenue_items').select('source,client,amount,status,due_date').neq('status', 'paid'),
		db.from('daily_checkins').select('date,most_important,avoiding,reflection,gratitude')
			.gte('date', daysAgo(2)).order('date', { ascending: false }),
		db.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
	]);
	return {
		date: today(),
		open_tasks: tasks.data ?? [],
		projects: projects.data ?? [],
		engagements: engagements.data ?? [],
		unpaid_revenue: revenue.data ?? [],
		recent_checkins: checkins.data ?? [],
		new_inquiries: inquiries.count ?? 0,
	};
}

const VOICE = `You are Maverick, the private chief-of-staff AI for Marlon Avery — Applied AI executive
(VP at JPMorgan Chase), founder of VoicePath, educator (AImpact), speaker. Write in his voice:
direct, warm, confident, zero corporate fluff, no exclamation-point cheerleading. His work splits
across four pillars: jpmorgan, voicepath, ai_impact, personal. The core principle: reduce
overwhelm, don't add work.`;

/** Find or create today's conversation ("Monday, July 7") and keep the briefing as its opening message. */
async function seedBriefingConversation(content: string) {
	const title = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TIME_ZONE }).format(new Date());
	let { data: convo } = await db.from('chat_conversations').select('id').eq('title', title).maybeSingle();
	if (!convo) {
		const { data, error } = await db.from('chat_conversations').insert({ title }).select('id').single();
		if (error) throw new Error(error.message);
		convo = data;
	}
	const { data: first } = await db
		.from('chat_messages')
		.select('id,role,model')
		.eq('conversation_id', convo.id)
		.order('created_at', { ascending: true })
		.limit(1)
		.maybeSingle();
	if (first?.role === 'assistant' && first.model === MODEL_PROFILES.fast) {
		await db.from('chat_messages').update({ content }).eq('id', first.id);
	} else {
		await db.from('chat_messages').insert({ conversation_id: convo.id, role: 'assistant', content, model: MODEL_PROFILES.fast });
	}
	return convo.id;
}

async function dailyBriefing() {
	const ctx = await gatherContext();
	const content = await callModel(
		'fast',
		VOICE,
		`Write today's briefing (${ctx.date}) from this snapshot of Marlon's world:\n\n${JSON.stringify(ctx, null, 1)}\n\n` +
			`Format as markdown with exactly these sections: "**Top 3 today**" (the three highest-leverage moves, ` +
			`numbered), "**Watch out**" (overdue items, stalled projects, follow-ups at risk — omit section if none), ` +
			`"**Money**" (outstanding/expected amounts — omit if none), "**Momentum**" (one sentence on what's working). ` +
			`Under 220 words total. No greeting, no sign-off.`,
	);
	const { error } = await db.from('daily_briefings').upsert(
		{ date: ctx.date, content, model: MODEL_PROFILES.fast },
		{ onConflict: 'date' },
	);
	if (error) throw new Error(error.message);
	const conversationId = await seedBriefingConversation(content);
	await audit({
		observed: `${ctx.open_tasks.length} open tasks, ${ctx.projects.length} live projects, ${ctx.new_inquiries} new inquiries`,
		recommended: 'daily briefing',
		action_taken: `generated daily briefing for ${ctx.date}`,
		action_type: 'daily_briefing',
	});
	return { content, conversation_id: conversationId };
}

async function weeklyReview() {
	const start = weekStart();
	const [done, projects, engagements, revenue, checkins] = await Promise.all([
		db.from('tasks').select('title,pillar,completed_at').eq('status', 'done').gte('completed_at', `${start}T00:00:00Z`),
		db.from('projects').select('name,pillar,status,next_action,updated_at'),
		db.from('engagements').select('event_name,status,fee,follow_up_needed,updated_at').not('status', 'in', '("lost")'),
		db.from('revenue_items').select('source,client,amount,status,paid_date'),
		db.from('daily_checkins').select('date,most_important,reflection').gte('date', start),
	]);
	const raw = await callModel(
		'reasoning',
		VOICE,
		`Draft Marlon's weekly review for the week starting ${start} from this data:\n` +
			`Completed tasks: ${JSON.stringify(done.data ?? [])}\nProjects: ${JSON.stringify(projects.data ?? [])}\n` +
			`Engagements: ${JSON.stringify(engagements.data ?? [])}\nRevenue items: ${JSON.stringify(revenue.data ?? [])}\n` +
			`Check-ins: ${JSON.stringify(checkins.data ?? [])}\n\n` +
			`Respond with ONLY a JSON object: {"wins": ["…"], "revenue_movement": "one or two sentences", ` +
			`"projects_advanced": ["project names"], "projects_stalled": ["project names"], ` +
			`"missed_followups": ["…"], "lessons": "one or two sentences", "next_top3": ["exactly", "three", "moves"]}`,
	);
	const review = parseJson(raw);
	const { data, error } = await db
		.from('weekly_reviews')
		.upsert(
			{
				week_start: start,
				wins: review.wins ?? [],
				revenue_movement: review.revenue_movement ?? null,
				projects_advanced: review.projects_advanced ?? [],
				projects_stalled: review.projects_stalled ?? [],
				missed_followups: review.missed_followups ?? [],
				lessons: review.lessons ?? null,
				next_top3: review.next_top3 ?? [],
			},
			{ onConflict: 'week_start' },
		)
		.select('*')
		.single();
	if (error) throw new Error(error.message);
	await audit({
		observed: `${done.data?.length ?? 0} tasks completed since ${start}`,
		recommended: 'weekly review draft',
		action_taken: `drafted weekly review for week of ${start}`,
		action_type: 'weekly_review',
		related_id: data.id,
	});
	return data;
}

/**
 * Nightly distillation — turn the day's real conversations into durable memory
 * so long chats don't evaporate. Runs via the maverick-nightly-distill cron;
 * also callable on demand. Idempotent: a conversation is only re-distilled if
 * it had new activity since summarized_at, and every candidate memory is
 * dedup-checked before insert.
 */
async function distillMemories() {
	const { data: convos } = await db
		.from('chat_conversations')
		.select('id,title,updated_at,summarized_at')
		.gte('updated_at', `${daysAgo(2)}T00:00:00Z`)
		.order('updated_at', { ascending: false })
		.limit(30);

	const pending = (convos ?? []).filter(
		(c) => !c.summarized_at || (c.updated_at && new Date(c.updated_at) > new Date(c.summarized_at)),
	);

	let processed = 0;
	let created = 0;

	for (const convo of pending) {
		const stamp = new Date().toISOString();
		const { data: msgs } = await db
			.from('chat_messages')
			.select('role,content')
			.eq('conversation_id', convo.id)
			.in('role', ['user', 'assistant'])
			.order('created_at', { ascending: true })
			.limit(100);
		const real = (msgs ?? []).filter((m) => m.content);

		// Skip briefing-only day threads and one-liners — need genuine back-and-forth.
		if (real.filter((m) => m.role === 'user').length < 2) {
			await db.from('chat_conversations').update({ summarized_at: stamp }).eq('id', convo.id);
			continue;
		}

		const transcript = real.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n').slice(0, 12000);
		let parsed: { summary?: string; memories?: { content?: string; kind?: string }[] };
		try {
			const raw = await callModel(
				'reasoning',
				VOICE,
				`Distill this conversation between Marlon (USER) and you (ASSISTANT) into durable memory. ` +
					`Keep only what's worth remembering weeks from now — decisions made, preferences revealed, facts ` +
					`about people or projects, commitments. Skip transient task chatter and anything already obvious.\n\n` +
					`${transcript}\n\n` +
					`Respond with ONLY a JSON object: {"summary": "one or two sentence recap", "memories": ` +
					`[{"content": "a single durable fact in third person", "kind": "fact|preference|decision|person|project_context"}]}. ` +
					`An empty memories array is fine when nothing is durable.`,
			);
			parsed = parseJson(raw);
		} catch {
			continue; // leave summarized_at unset so it retries tomorrow
		}

		const candidates = [
			...(parsed.summary ? [{ content: `Conversation "${convo.title}": ${parsed.summary}`, kind: 'conversation_summary' }] : []),
			...(Array.isArray(parsed.memories) ? parsed.memories : []),
		];
		for (const item of candidates) {
			const content = typeof item.content === 'string' ? item.content.trim() : '';
			if (!content || content.length > 4000) continue;
			const embedding = await embed(content);
			if (await isDuplicateMemory(embedding)) continue;
			await db.from('maverick_memories').insert({
				content,
				embedding,
				kind: item.kind ?? 'conversation_summary',
				source: 'chat',
				metadata: { conversation_id: convo.id },
			});
			created++;
		}
		await db.from('chat_conversations').update({ summarized_at: stamp }).eq('id', convo.id);
		processed++;
	}

	await audit({
		observed: `${pending.length} conversation(s) with activity since last distillation`,
		recommended: 'distill conversations into long-term memory',
		action_taken: `distilled ${processed} conversation(s) into ${created} new memories`,
		action_type: 'distill_memories',
	});
	return { processed, created };
}

Deno.serve(async (req: Request) => {
	const headers = corsHeaders(req.headers.get('origin'));
	if (req.method === 'OPTIONS') return new Response('ok', { headers });
	if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });

	// verify_jwt already validated the token signature. Two ways in from here:
	// Marlon's own session, or the pg_cron scheduler carrying the vault secret.
	const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	const { data: userData } = await createClient(SUPABASE_URL, SERVICE_ROLE_KEY).auth.getUser(jwt);
	let authorized = userData?.user?.email === OWNER_EMAIL;
	if (!authorized) {
		const cronHeader = req.headers.get('x-maverick-cron');
		if (cronHeader) {
			const { data: secret } = await db.rpc('get_cron_secret');
			authorized = typeof secret === 'string' && secret.length > 0 && cronHeader === secret;
		}
	}
	if (!authorized) {
		return new Response(JSON.stringify({ error: 'This studio is for MA.' }), { status: 403, headers });
	}

	if (!OPENROUTER_API_KEY) {
		return new Response(
			JSON.stringify({ error: 'missing_openrouter_key', message: 'Add OPENROUTER_API_KEY in Supabase → Edge Functions → Secrets to turn on AI briefings.' }),
			{ status: 400, headers },
		);
	}

	try {
		const { action } = await req.json().catch(() => ({ action: '' }));
		const result =
			action === 'daily_briefing' ? await dailyBriefing()
			: action === 'weekly_review' ? await weeklyReview()
			: action === 'distill_memories' ? await distillMemories()
			: null;
		if (result === null) {
			return new Response(JSON.stringify({ error: `Unknown action "${action}"` }), { status: 400, headers });
		}
		return new Response(JSON.stringify({ ok: true, result }), { headers });
	} catch (err) {
		console.error('maverick-agent error:', err);
		return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }), {
			status: 500,
			headers,
		});
	}
});
