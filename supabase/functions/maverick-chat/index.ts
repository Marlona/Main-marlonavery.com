/**
 * maverick-chat — Maverick's conversational core (Phase 2A).
 *
 * Claude/ChatGPT-style streaming chat, owner-gated (verify_jwt + email pin).
 * POST { conversation_id?, content } → Server-Sent Events:
 *   data: {"type":"meta","conversation_id":…}
 *   data: {"type":"token","text":…}          — streamed reply text
 *   data: {"type":"tool","name":…,"status":"running"|"done"|"error"}
 *   data: {"type":"done"} | {"type":"error","message":…}
 *
 * The tool loop runs INTERNAL tools only — task/project/engagement/revenue
 * CRUD, vector-store memory, check-ins, dashboard snapshot, and the Elevate
 * coaching tools (goals, self-talk, affirmation generation via
 * maverick-elevate, ritual check-ins). Per the standing guardrail (CLAUDE.md),
 * external actions (email, Stripe invoices, calendar writes, Claude Code
 * handoff) are NOT wired here; they arrive in 2B/2C as approval-queue
 * dispatches. Every tool execution writes to audit_log.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OWNER_EMAIL = 'hi@marlonavery.com';
const TIME_ZONE = 'America/New_York';
const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 30;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const CHAT_MODEL = Deno.env.get('MODEL_REASONING') ?? 'anthropic/claude-sonnet-5';

/**
 * Explicit routing (see docs/maverick-phase2.md → Model routing): ordered
 * fallback chain inside the Claude family — tool-calling reliability and
 * voice stay consistent even when a provider hiccups — plus provider prefs
 * that prefer Anthropic direct and exclude hosts that train on prompts.
 */
const CHAT_ROUTE = {
	models: [CHAT_MODEL, 'anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.5'].filter((m, i, a) => a.indexOf(m) === i),
	provider: { order: ['Anthropic'], data_collection: 'deny' },
};

const ALLOWED_ORIGINS = new Set([
	'https://marlonavery.com',
	'https://www.marlonavery.com',
	'https://staging.marlonavery.com',
	'http://localhost:4321',
	'http://localhost:4399',
]);

const corsHeaders = (origin: string | null, contentType = 'application/json') => ({
	'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://marlonavery.com',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Content-Type': contentType,
});

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

declare const Supabase: { ai: { Session: new (model: string) => { run(input: string, opts: Record<string, unknown>): Promise<number[]> } } };
const embedder = new Supabase.ai.Session('gte-small');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
const nowET = () =>
	new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date());

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

async function gatherContext() {
	const [tasks, projects, engagements, revenue, checkins, inquiries, goal, affirmations, resonance, events] = await Promise.all([
		db.from('tasks').select('title,status,priority,due_date,pillar,impact_score,urgency_score')
			.neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(40),
		db.from('projects').select('name,pillar,status,priority,next_action,deadline')
			.in('status', ['active', 'waiting', 'stalled']),
		db.from('engagements').select('event_name,event_date,status,fee,balance_due,follow_up_needed,prep_status')
			.not('status', 'in', '("completed","lost")'),
		db.from('revenue_items').select('source,client,amount,status,due_date').neq('status', 'paid'),
		db.from('daily_checkins').select('date,most_important,avoiding,reflection,gratitude')
			.order('date', { ascending: false }).limit(2),
		db.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
		db.from('goals').select('destination_text,worth_statement,commitment_level,place_a_summary')
			.eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
		db.from('affirmations').select('text,target,version').eq('status', 'active'),
		db.from('affirmation_checkins').select('type,resonance_score,behavior_connection,created_at')
			.gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
		db.from('agent_events').select('event_type,payload').eq('status', 'open').limit(10),
	]);
	return {
		open_tasks: tasks.data ?? [],
		projects: projects.data ?? [],
		engagements: engagements.data ?? [],
		unpaid_revenue: revenue.data ?? [],
		recent_checkins: checkins.data ?? [],
		new_inquiries: inquiries.count ?? 0,
		elevate: {
			destination: goal.data ?? null,
			active_affirmations: affirmations.data ?? [],
			last_7d_checkins: resonance.data ?? [],
			open_observations: events.data ?? [],
		},
	};
}

async function recallMemories(query: string) {
	try {
		const embedding = await embedder.run(query, { mean_pool: true, normalize: true });
		const { data } = await db.rpc('match_maverick_memories', {
			query_embedding: embedding,
			match_count: 6,
			min_similarity: 0.6,
		});
		return (data ?? []).map((m: { content: string; kind: string }) => `[${m.kind}] ${m.content}`);
	} catch {
		return []; // memory is a bonus, never a blocker
	}
}

const SYSTEM_PROMPT = (snapshot: unknown, memories: string[]) => `You are Maverick — Marlon Avery's private
chief-of-staff AI, living in his command center at marlonavery.com/maverick. Marlon is an Applied AI
executive (VP, Applied AI Lead at JPMorgan Chase), founder & CEO of VoicePath, Head of AI at AImpact,
educator, and speaker. His work splits across four pillars: jpmorgan, voicepath, ai_impact, personal.

Voice: direct, warm, confident, zero corporate fluff, no exclamation-point cheerleading. Core principle:
reduce overwhelm, don't add work. Be concise — this is a working tool, not an essay contest. Use markdown.

It is now ${nowET()}.

You have tools that operate his real command-center data (tasks, projects, speaking pipeline, revenue,
check-ins, long-term memory). Use them when he asks you to do something, not just talk about it. After
acting, confirm briefly what changed. When he shares a durable fact, preference, or decision worth keeping,
save it with the remember tool — mention it in one short phrase when you do.

Not wired up yet (coming in the next build phases — say so plainly if asked, and offer a useful
alternative like drafting content or adding a task): sending email, creating Stripe invoices, editing
the calendar, and handing code tasks to Claude Code. Those will require Marlon's approval per action
when they arrive. Never claim to have done any of those things.

ELEVATE — you are also Marlon's development coach (Intentional Development Model). Contract:
- Things happen FOR him — not to him. Observe, don't judge: feedback is observation + question
  ("I noticed X. Does that support where you said you want to go?").
- Never name the villain. If data points at a person or habit, create perspectives until HE says
  it first. Start with outcomes and feelings, not people — the mirror before the microscope.
- His words over yours. Quote his own phrasing in goals, summaries, and affirmations.
- When he wants to set or revise a destination: reflect it back, then ask ONE qualifying question —
  "What is this worth to you?" (life-changing, or help through a sticking point?) — then declare_goal.
- Affirmations: present tense only ("I am…"); "I am becoming…" permitted; forward-severing allowed
  ("no longer serves who I am becoming"); no negation-of-negative. Before generating, invite him to
  seed 1–3 in his own words, then call generate_affirmations with the seeds (seed-then-shape).
- When he shares inner dialogue or how he talks to himself, capture it with capture_self_talk.
- No universal prescriptions — balance is his to define. Never prescribe hours, limits, or schedules.
- Calibrate to his snapshot commitment level: life_changing → direct challenge; sticking_point →
  lighter touch; exploring → progressive disclosure, don't unload the whole model.
- You are a development coach, not a therapist. On signals of crisis or clinical distress, pause
  coaching and suggest professional support.

Live snapshot of his world:
${JSON.stringify(snapshot)}

${memories.length ? `Long-term memories that may be relevant:\n${memories.join('\n')}` : 'No stored memories matched this message.'}`;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOLS = [
	{ name: 'get_snapshot', description: 'Fetch a fresh snapshot of all open tasks, projects, engagements, unpaid revenue, and recent check-ins.', parameters: { type: 'object', properties: {} } },
	{ name: 'create_task', description: 'Create a task, optionally attached to a project by (fuzzy) name.', parameters: { type: 'object', properties: {
		title: { type: 'string' }, project_name: { type: 'string', description: 'Fuzzy project name to attach to' },
		pillar: { type: 'string', enum: ['jpmorgan', 'voicepath', 'ai_impact', 'personal'] },
		priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
		due_date: { type: 'string', description: 'YYYY-MM-DD' }, description: { type: 'string' },
		impact_score: { type: 'integer', minimum: 1, maximum: 5 }, urgency_score: { type: 'integer', minimum: 1, maximum: 5 },
	}, required: ['title'] } },
	{ name: 'update_task', description: 'Update or complete a task found by fuzzy title match.', parameters: { type: 'object', properties: {
		title_match: { type: 'string' }, status: { type: 'string', enum: ['not_started', 'in_progress', 'waiting', 'done'] },
		due_date: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
	}, required: ['title_match'] } },
	{ name: 'update_project', description: 'Update a project (status, next action, priority, deadline) found by fuzzy name match.', parameters: { type: 'object', properties: {
		name_match: { type: 'string' }, status: { type: 'string', enum: ['active', 'waiting', 'stalled', 'completed', 'archived'] },
		next_action: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, deadline: { type: 'string' },
	}, required: ['name_match'] } },
	{ name: 'create_engagement', description: 'Add a speaking/workshop engagement to the pipeline.', parameters: { type: 'object', properties: {
		event_name: { type: 'string' }, organization: { type: 'string' }, event_date: { type: 'string', description: 'YYYY-MM-DD' },
		location: { type: 'string' }, format: { type: 'string', enum: ['virtual', 'in_person'] }, topic: { type: 'string' },
		status: { type: 'string', enum: ['lead', 'intro', 'proposal', 'negotiating', 'confirmed', 'signed', 'invoiced', 'paid', 'completed', 'lost'] },
		fee: { type: 'number' }, notes: { type: 'string' },
	}, required: ['event_name'] } },
	{ name: 'update_engagement', description: 'Update an engagement (stage, fee, flags, prep) found by fuzzy event-name match.', parameters: { type: 'object', properties: {
		name_match: { type: 'string' },
		status: { type: 'string', enum: ['lead', 'intro', 'proposal', 'negotiating', 'confirmed', 'signed', 'invoiced', 'paid', 'completed', 'lost'] },
		fee: { type: 'number' }, follow_up_needed: { type: 'boolean' }, prep_status: { type: 'string' }, notes: { type: 'string' },
		contract_signed: { type: 'boolean' }, invoice_sent: { type: 'boolean' }, payment_received: { type: 'boolean' },
		event_date: { type: 'string' }, location: { type: 'string' },
	}, required: ['name_match'] } },
	{ name: 'add_revenue_item', description: 'Record a revenue line item.', parameters: { type: 'object', properties: {
		source: { type: 'string', enum: ['speaking', 'workshop', 'consulting', 'voicepath_retainer', 'implementation', 'partner'] },
		amount: { type: 'number' }, client: { type: 'string' }, status: { type: 'string', enum: ['expected', 'invoiced', 'paid'] },
		due_date: { type: 'string' }, business_line: { type: 'string', enum: ['voicepath', 'ai_impact', 'personal'] },
	}, required: ['source', 'amount'] } },
	{ name: 'update_revenue_status', description: 'Mark a revenue item expected/invoiced/paid, found by fuzzy client or source match.', parameters: { type: 'object', properties: {
		match: { type: 'string', description: 'Client name or source to match' }, status: { type: 'string', enum: ['expected', 'invoiced', 'paid'] },
	}, required: ['match', 'status'] } },
	{ name: 'remember', description: "Save a durable fact, preference, or decision to Maverick's long-term memory.", parameters: { type: 'object', properties: {
		content: { type: 'string' }, kind: { type: 'string', enum: ['fact', 'preference', 'decision', 'person', 'project_context', 'conversation_summary'] },
	}, required: ['content'] } },
	{ name: 'recall_memories', description: 'Search long-term memory semantically.', parameters: { type: 'object', properties: {
		query: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 15 },
	}, required: ['query'] } },
	{ name: 'upsert_checkin', description: "Save fields of today's daily check-in (only the provided fields change).", parameters: { type: 'object', properties: {
		most_important: { type: 'string' }, avoiding: { type: 'string' }, success_looks_like: { type: 'string' },
		gratitude: { type: 'string' }, reflection: { type: 'string' },
	} } },
	{ name: 'declare_goal', description: "Elevate: declare or revise Marlon's destination (Place B). Ask 'what is this worth to you?' first; any prior active goal becomes revised.", parameters: { type: 'object', properties: {
		destination_text: { type: 'string', description: "Where he wants to go, in HIS words" },
		worth_statement: { type: 'string', description: "His answer to 'what is this worth to you?'" },
		commitment_level: { type: 'string', enum: ['life_changing', 'sticking_point', 'exploring'] },
		place_a_summary: { type: 'string', description: 'Where he is today, briefly, in his words' },
	}, required: ['destination_text'] } },
	{ name: 'capture_self_talk', description: 'Elevate: save a sample of how Marlon talks to himself internally (feeds affirmation generation).', parameters: { type: 'object', properties: {
		raw_text: { type: 'string' }, detected_pattern: { type: 'string', description: 'the recurring pattern you observe, if any' },
		sentiment: { type: 'string', enum: ['negative', 'neutral', 'positive'] },
	}, required: ['raw_text'] } },
	{ name: 'generate_affirmations', description: 'Elevate: generate a validated 3–5 affirmation set for the active destination. Pass his own seed drafts when he offers them (seed-then-shape).', parameters: { type: 'object', properties: {
		seeds: { type: 'array', items: { type: 'string' }, description: 'His own draft affirmations, verbatim (0–3)' },
		replace: { type: 'boolean', description: 'true to retire the current active set and start fresh' },
	} } },
	{ name: 'log_affirmation_checkin', description: 'Elevate: record a morning read or evening resonance check-in when he reports it in conversation.', parameters: { type: 'object', properties: {
		type: { type: 'string', enum: ['morning', 'evening', 'weekly'] },
		read: { type: 'boolean' }, resonance_score: { type: 'integer', minimum: 1, maximum: 5 },
		behavior_connection: { type: 'boolean', description: 'did an affirmation connect to real behavior today?' },
		notes_text: { type: 'string' },
	}, required: ['type'] } },
];

type ToolArgs = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Fuzzy single-row lookup; throws a helpful message when 0 or >1 match. */
async function findOne(table: string, column: string, match: string, select: string) {
	const { data, error } = await db.from(table).select(select).ilike(column, `%${match}%`).limit(5);
	if (error) throw new Error(error.message);
	if (!data?.length) throw new Error(`No ${table} row matches "${match}"`);
	if (data.length > 1) {
		const names = data.map((r: Record<string, unknown>) => `"${r[column]}"`).join(', ');
		throw new Error(`"${match}" is ambiguous — matches: ${names}. Be more specific.`);
	}
	return data[0] as Record<string, unknown>;
}

async function execTool(name: string, args: ToolArgs): Promise<unknown> {
	switch (name) {
		case 'get_snapshot':
			return await gatherContext();
		case 'create_task': {
			let projectId: string | null = null;
			let pillar = s(args.pillar);
			if (s(args.project_name)) {
				const project = await findOne('projects', 'name', s(args.project_name)!, 'id,name,pillar');
				projectId = project.id as string;
				pillar ??= project.pillar as string;
			}
			const { data, error } = await db.from('tasks').insert({
				title: s(args.title)!, project_id: projectId, pillar: pillar ?? 'personal',
				priority: s(args.priority) ?? 'medium', due_date: s(args.due_date) ?? null,
				description: s(args.description) ?? null,
				impact_score: typeof args.impact_score === 'number' ? args.impact_score : 3,
				urgency_score: typeof args.urgency_score === 'number' ? args.urgency_score : 3,
			}).select('id,title,pillar,due_date').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'update_task': {
			const task = await findOne('tasks', 'title', s(args.title_match)!, 'id,title,status');
			const patch: Record<string, unknown> = {};
			if (s(args.status)) {
				patch.status = s(args.status);
				patch.completed_at = args.status === 'done' ? new Date().toISOString() : null;
			}
			if (s(args.due_date)) patch.due_date = s(args.due_date);
			if (s(args.priority)) patch.priority = s(args.priority);
			const { data, error } = await db.from('tasks').update(patch).eq('id', task.id as string).select('id,title,status,due_date').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'update_project': {
			const project = await findOne('projects', 'name', s(args.name_match)!, 'id,name');
			const patch: Record<string, unknown> = {};
			for (const key of ['status', 'next_action', 'priority', 'deadline']) if (s(args[key])) patch[key] = s(args[key]);
			const { data, error } = await db.from('projects').update(patch).eq('id', project.id as string).select('id,name,status,next_action').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'create_engagement': {
			const { data, error } = await db.from('engagements').insert({
				event_name: s(args.event_name)!, organization: s(args.organization) ?? null,
				event_date: s(args.event_date) ?? null, location: s(args.location) ?? null,
				format: s(args.format) ?? null, topic: s(args.topic) ?? null,
				status: s(args.status) ?? 'lead', fee: typeof args.fee === 'number' ? args.fee : 0,
				notes: s(args.notes) ?? null,
			}).select('id,event_name,status,event_date').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'update_engagement': {
			const engagement = await findOne('engagements', 'event_name', s(args.name_match)!, 'id,event_name');
			const patch: Record<string, unknown> = {};
			for (const key of ['status', 'prep_status', 'notes', 'event_date', 'location']) if (s(args[key])) patch[key] = s(args[key]);
			if (typeof args.fee === 'number') patch.fee = args.fee;
			for (const key of ['follow_up_needed', 'contract_signed', 'invoice_sent', 'payment_received'])
				if (typeof args[key] === 'boolean') patch[key] = args[key];
			const { data, error } = await db.from('engagements').update(patch).eq('id', engagement.id as string)
				.select('id,event_name,status,fee,follow_up_needed').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'add_revenue_item': {
			const { data, error } = await db.from('revenue_items').insert({
				source: s(args.source)!, amount: Number(args.amount), client: s(args.client) ?? null,
				status: s(args.status) ?? 'expected', due_date: s(args.due_date) ?? null,
				business_line: s(args.business_line) ?? null,
				paid_date: args.status === 'paid' ? today() : null,
			}).select('id,source,client,amount,status').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'update_revenue_status': {
			const match = s(args.match)!;
			const { data: rows, error: findError } = await db.from('revenue_items')
				.select('id,client,source,amount,status').or(`client.ilike.%${match}%,source.ilike.%${match}%`).limit(5);
			if (findError) throw new Error(findError.message);
			if (!rows?.length) throw new Error(`No revenue item matches "${match}"`);
			if (rows.length > 1) throw new Error(`"${match}" matches ${rows.length} items — be more specific.`);
			const { data, error } = await db.from('revenue_items')
				.update({ status: s(args.status)!, paid_date: args.status === 'paid' ? today() : null })
				.eq('id', rows[0].id).select('id,client,source,amount,status').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'remember': {
			const content = s(args.content);
			if (!content) throw new Error('remember needs content');
			const embedding = await embedder.run(content, { mean_pool: true, normalize: true });
			// Dedup: skip near-identical memories so facts don't pile up.
			const { data: dup } = await db.rpc('match_maverick_memories', { query_embedding: embedding, match_count: 1, min_similarity: 0.9 });
			if ((dup ?? []).length) return { ...dup[0], duplicate: true };
			const kind = s(args.kind) ?? 'fact';
			const { data, error } = await db.from('maverick_memories')
				.insert({ content, embedding, kind, source: 'chat' }).select('id,kind').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'recall_memories': {
			const embedding = await embedder.run(s(args.query)!, { mean_pool: true, normalize: true });
			const { data, error } = await db.rpc('match_maverick_memories', {
				query_embedding: embedding,
				match_count: Math.min(Number(args.count) || 8, 15),
				min_similarity: 0.5,
			});
			if (error) throw new Error(error.message);
			return data;
		}
		case 'upsert_checkin': {
			const fields: Record<string, unknown> = {};
			for (const key of ['most_important', 'avoiding', 'success_looks_like', 'gratitude', 'reflection'])
				if (s(args[key])) fields[key] = s(args[key]);
			if (!Object.keys(fields).length) throw new Error('No check-in fields provided');
			const { data: existing } = await db.from('daily_checkins').select('id').eq('date', today()).maybeSingle();
			const { data, error } = existing
				? await db.from('daily_checkins').update(fields).eq('id', existing.id).select('date').single()
				: await db.from('daily_checkins').insert({ date: today(), ...fields }).select('date').single();
			if (error) throw new Error(error.message);
			return { saved: Object.keys(fields), date: data.date };
		}
		case 'declare_goal': {
			const destination = s(args.destination_text);
			if (!destination) throw new Error('declare_goal needs destination_text');
			await db.from('goals').update({ status: 'revised', revised_at: new Date().toISOString() }).eq('status', 'active');
			const { data, error } = await db.from('goals').insert({
				destination_text: destination,
				worth_statement: s(args.worth_statement) ?? null,
				commitment_level: ['life_changing', 'sticking_point', 'exploring'].includes(s(args.commitment_level) ?? '')
					? s(args.commitment_level)
					: 'exploring',
				place_a_summary: s(args.place_a_summary) ?? null,
				status: 'active',
			}).select('id,destination_text,commitment_level,worth_statement').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'capture_self_talk': {
			const rawText = s(args.raw_text);
			if (!rawText) throw new Error('capture_self_talk needs raw_text');
			const { data, error } = await db.from('self_talk_samples').insert({
				raw_text: rawText,
				detected_pattern: s(args.detected_pattern) ?? null,
				sentiment: ['negative', 'neutral', 'positive'].includes(s(args.sentiment) ?? '') ? s(args.sentiment) : null,
			}).select('id').single();
			if (error) throw new Error(error.message);
			return data;
		}
		case 'generate_affirmations': {
			// One implementation of the validator: delegate to maverick-elevate,
			// authenticating server-to-server with the cron secret.
			const { data: secret } = await db.rpc('get_cron_secret');
			if (typeof secret !== 'string' || !secret) throw new Error('cron secret unavailable');
			const res = await fetch(`${SUPABASE_URL}/functions/v1/maverick-elevate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
					'x-maverick-cron': secret,
				},
				body: JSON.stringify({
					action: 'generate',
					seeds: Array.isArray(args.seeds) ? args.seeds.slice(0, 3) : [],
					replace: args.replace === true,
				}),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok || !body.ok) throw new Error(body.error ?? `generate failed (${res.status})`);
			return body.result;
		}
		case 'log_affirmation_checkin': {
			const type = s(args.type);
			if (!type || !['morning', 'evening', 'weekly'].includes(type)) throw new Error('type must be morning|evening|weekly');
			const { data, error } = await db.from('affirmation_checkins').insert({
				type,
				read: typeof args.read === 'boolean' ? args.read : type === 'morning',
				resonance_score: typeof args.resonance_score === 'number' ? Math.min(Math.max(Math.round(args.resonance_score), 1), 5) : null,
				behavior_connection: typeof args.behavior_connection === 'boolean' ? args.behavior_connection : null,
				notes_text: s(args.notes_text) ?? null,
			}).select('id,type').single();
			if (error) throw new Error(error.message);
			return data;
		}
		default:
			throw new Error(`Unknown tool "${name}"`);
	}
}

// ---------------------------------------------------------------------------
// OpenRouter streaming + tool loop
// ---------------------------------------------------------------------------

type ORMessage = { role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };
type PendingCall = { id: string; name: string; arguments: string };

/** Stream one OpenRouter completion; forward text tokens; collect tool calls. */
async function streamCompletion(
	messages: ORMessage[],
	emit: (event: Record<string, unknown>) => void,
	signal: AbortSignal,
): Promise<{ content: string; toolCalls: PendingCall[] }> {
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		signal,
		headers: {
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://marlonavery.com',
			'X-Title': 'Maverick Chat',
		},
		body: JSON.stringify({
			...CHAT_ROUTE,
			messages,
			stream: true,
			tools: TOOLS.map((tool) => ({ type: 'function', function: tool })),
		}),
	});
	if (!res.ok || !res.body) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body?.error?.message ?? `OpenRouter error ${res.status}`);
	}

	let content = '';
	const calls = new Map<number, PendingCall>();
	const decoder = new TextDecoder();
	let buffer = '';

	for await (const chunk of res.body) {
		buffer += decoder.decode(chunk, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';
		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;
			const payload = line.slice(6).trim();
			if (payload === '[DONE]') continue;
			let parsed: { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
			try {
				parsed = JSON.parse(payload);
			} catch {
				continue;
			}
			const delta = parsed.choices?.[0]?.delta;
			if (!delta) continue;
			if (delta.content) {
				content += delta.content;
				emit({ type: 'token', text: delta.content });
			}
			for (const tc of delta.tool_calls ?? []) {
				const entry = calls.get(tc.index) ?? { id: '', name: '', arguments: '' };
				if (tc.id) entry.id = tc.id;
				if (tc.function?.name) entry.name += tc.function.name;
				if (tc.function?.arguments) entry.arguments += tc.function.arguments;
				calls.set(tc.index, entry);
			}
		}
	}
	return { content, toolCalls: [...calls.values()].filter((c) => c.name) };
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
	const origin = req.headers.get('origin');
	if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
	if (req.method !== 'POST')
		return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: corsHeaders(origin) });

	const jwt = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
	const { data: userData } = await createClient(SUPABASE_URL, SERVICE_ROLE_KEY).auth.getUser(jwt);
	if (userData?.user?.email !== OWNER_EMAIL)
		return new Response(JSON.stringify({ error: 'This studio is for MA.' }), { status: 403, headers: corsHeaders(origin) });
	if (!OPENROUTER_API_KEY)
		return new Response(
			JSON.stringify({ error: 'missing_openrouter_key', message: 'Add OPENROUTER_API_KEY in Supabase → Edge Functions → Secrets.' }),
			{ status: 400, headers: corsHeaders(origin) },
		);

	const body = await req.json().catch(() => ({}));
	const content = typeof body.content === 'string' ? body.content.trim() : '';
	if (!content || content.length > 8000)
		return new Response(JSON.stringify({ error: 'content must be 1–8000 characters' }), { status: 400, headers: corsHeaders(origin) });

	// Resolve / create the conversation before streaming starts
	let conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : null;
	if (conversationId) {
		const { data } = await db.from('chat_conversations').select('id').eq('id', conversationId).maybeSingle();
		if (!data) conversationId = null;
	}
	if (!conversationId) {
		const title = content.length > 60 ? `${content.slice(0, 57)}…` : content;
		const { data, error } = await db.from('chat_conversations').insert({ title }).select('id').single();
		if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders(origin) });
		conversationId = data.id;
	}
	await db.from('chat_messages').insert({ conversation_id: conversationId, role: 'user', content });

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const emit = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

			(async () => {
				try {
					emit({ type: 'meta', conversation_id: conversationId });

					const [snapshot, memories, historyRes] = await Promise.all([
						gatherContext(),
						recallMemories(content),
						db.from('chat_messages').select('role,content')
							.eq('conversation_id', conversationId!).in('role', ['user', 'assistant'])
							.order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
					]);
					const history = (historyRes.data ?? []).reverse().filter((m) => m.content);

					const messages: ORMessage[] = [
						{ role: 'system', content: SYSTEM_PROMPT(snapshot, memories) },
						...history.map((m) => ({ role: m.role, content: m.content })),
					];

					const executed: { name: string; arguments: unknown; result: unknown }[] = [];
					let finalContent = '';

					for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
						const { content: text, toolCalls } = await streamCompletion(messages, emit, req.signal);
						finalContent += text;
						if (!toolCalls.length) break;
						if (round === MAX_TOOL_ROUNDS) {
							emit({ type: 'tool', name: 'loop', status: 'error', detail: 'tool budget exhausted' });
							break;
						}
						messages.push({
							role: 'assistant',
							content: text || null,
							tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })),
						});
						for (const call of toolCalls) {
							emit({ type: 'tool', name: call.name, status: 'running' });
							let result: unknown;
							try {
								const args = call.arguments ? JSON.parse(call.arguments) : {};
								result = await execTool(call.name, args);
								emit({ type: 'tool', name: call.name, status: 'done' });
								executed.push({ name: call.name, arguments: args, result });
								await db.from('audit_log').insert({
									observed: `chat: "${content.slice(0, 140)}"`,
									recommended: `${call.name}(${call.arguments.slice(0, 300)})`,
									action_taken: JSON.stringify(result).slice(0, 300),
									action_type: `chat_tool:${call.name}`,
									approved: true,
								});
							} catch (err) {
								result = { error: err instanceof Error ? err.message : 'tool failed' };
								emit({ type: 'tool', name: call.name, status: 'error', detail: (result as { error: string }).error });
							}
							messages.push({ role: 'tool', content: JSON.stringify(result), tool_call_id: call.id });
						}
						if (text) finalContent += '\n\n';
					}

					await db.from('chat_messages').insert({
						conversation_id: conversationId!,
						role: 'assistant',
						content: finalContent,
						tool_calls: executed.length ? executed : null,
						model: CHAT_MODEL,
					});
					await db.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId!);
					emit({ type: 'done' });
				} catch (err) {
					if (!req.signal.aborted) {
						console.error('maverick-chat error:', err);
						try {
							emit({ type: 'error', message: err instanceof Error ? err.message : 'Unexpected error' });
						} catch { /* stream already closed */ }
					}
				} finally {
					try {
						controller.close();
					} catch { /* already closed */ }
				}
			})();
		},
	});

	return new Response(stream, {
		headers: { ...corsHeaders(origin, 'text/event-stream'), 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
	});
});
