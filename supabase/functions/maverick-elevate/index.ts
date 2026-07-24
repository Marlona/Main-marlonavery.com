/**
 * maverick-elevate — the Elevate coaching engine (Intentional Development
 * Model). Moves Marlon from Place A to Place B via framework-validated
 * affirmations and a signal-driven adjustment loop.
 *
 * Methodology contract (hard rules, see docs/maverick-elevate.md):
 * observe don't judge · never name the villain · the user's words over the
 * AI's · present tense only ("I am…", "I am becoming…") · no universal
 * prescriptions · things happen FOR you · coach, not therapist.
 *
 * Actions:
 *   generate      — {goal_id?, seeds?, replace?} → validated 3–5 affirmation set
 *   adjust        — nightly signal loop → agent_events carrying PROPOSALS;
 *                   nothing changes until Marlon accepts (resolve_event)
 *   resolve_event — {event_id, decision} → executes or dismisses a proposal
 *   rewrite       — {goal_id?} → dictation cleanup of the declared destination
 *                   (his words kept — artifacts out), updates the goals row
 *   visualize     — {goal_id?} → paints Place B (image model → storage bucket
 *                   `elevate`), sets goals.vision_image_path
 *
 * Auth: owner JWT or the pg_cron vault secret (same pattern as maverick-agent).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const OWNER_EMAIL = 'hi@marlonavery.com';
const TIME_ZONE = 'America/New_York';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');

const MODEL_PROFILES = {
	reasoning: { model: Deno.env.get('MODEL_REASONING') ?? 'anthropic/claude-sonnet-5', fallbacks: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.5'] },
	writing: { model: Deno.env.get('MODEL_WRITING') ?? 'anthropic/claude-sonnet-5', fallbacks: ['anthropic/claude-sonnet-4.6', 'anthropic/claude-sonnet-4.5'] },
	// Dictation cleanup — latest Gemini text model (Marlon's call, 2026-07-15).
	rewrite: { model: Deno.env.get('MODEL_REWRITE') ?? 'google/gemini-3.5-flash', fallbacks: ['google/gemini-3.1-pro-preview', 'anthropic/claude-sonnet-5'] },
	// Destination vision image — latest Gemini image model.
	image: { model: Deno.env.get('MODEL_IMAGE') ?? 'google/gemini-3.1-flash-image', fallbacks: ['google/gemini-3-pro-image', 'google/gemini-2.5-flash-image'] },
} as const;

const routeFor = (profile: keyof typeof MODEL_PROFILES) => ({
	models: [MODEL_PROFILES[profile].model, ...MODEL_PROFILES[profile].fallbacks].filter((m, i, a) => a.indexOf(m) === i),
	provider: { data_collection: 'deny' },
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

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

async function callModel(profile: keyof typeof MODEL_PROFILES, system: string, user: string): Promise<string> {
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://marlonavery.com',
			'X-Title': 'Maverick Elevate',
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

/** One image via OpenRouter's multimodal output — returns raw bytes + mime. */
async function callImageModel(prompt: string): Promise<{ bytes: Uint8Array; mime: string }> {
	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://marlonavery.com',
			'X-Title': 'Maverick Elevate',
		},
		body: JSON.stringify({
			...routeFor('image'),
			modalities: ['image', 'text'],
			messages: [{ role: 'user', content: prompt }],
		}),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body?.error?.message ?? `OpenRouter error ${res.status}`);
	const dataUrl = body?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
	if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) throw new Error('Image model returned no image');
	const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
	const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
	return { bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), mime };
}

const parseJson = (raw: string) => {
	const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
	const start = Math.min(...[cleaned.indexOf('{'), cleaned.indexOf('[')].filter((i) => i >= 0));
	const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
	return JSON.parse(cleaned.slice(start, end + 1));
};

const audit = (entry: { observed: string; recommended: string; action_taken: string; action_type: string; related_id?: string }) =>
	db.from('audit_log').insert({ ...entry, approved: true });

// ---------------------------------------------------------------------------
// Linguistic validator (spec Step 4 — hard rules)
// ---------------------------------------------------------------------------

export function validateAffirmation(text: string): { ok: boolean; reasons: string[] } {
	const reasons: string[] = [];
	const t = text.trim();
	if (!/\b(I am|I'm|I stand|I build|I choose|I honor|I lead|I create|I show up|My \w+ (is|are))\b/i.test(t)) {
		reasons.push('missing first-person present state ("I am…")');
	}
	if (/\bI (was|want|wish|hope|will)\b/i.test(t)) reasons.push('past/future/desire tense ("I was/want/will")');
	if (/\bsomeday\b/i.test(t)) reasons.push('"someday" — not current state');
	if (/\btry(ing)? to\b/i.test(t)) reasons.push('"trying to" — activity, not state');
	// Negation-of-negative is out — EXCEPT the forward-severing clause ("no longer serves").
	const severed = t.replace(/\bno longer serves?\b[^.]*/gi, '');
	if (/\b(not|never|no longer|nothing|can't|cannot|don't|won't|isn't|aren't|anymore)\b/i.test(severed)) {
		reasons.push('negation language — reframe to the positive present state');
	}
	return { ok: reasons.length === 0, reasons };
}

const FRAMEWORK = `Affirmation linguistic framework (hard rules):
1. Present tense, current state: "I am…" — never "I was", never "I want to be".
2. "I am becoming…" is permitted — an active state and a statement of faith.
3. First person — the user's own version of the life they want, never a quote.
4. Forward-severing allowed: "What I used to do no longer serves who I am becoming."
5. No judgment language, no negation-of-negative ("I am not lazy anymore" → reframe positive).
6. Use the user's own vocabulary from his seeds, assessment, and self-talk so it sounds like HIM.
Keep each under 30 words. Fewer, deeper — not a wall of quotes.`;

/** Validate; on failure ask the writing model for one compliant rewrite; revalidate. */
async function ensureValid(text: string): Promise<{ text: string; ok: boolean; reasons: string[] }> {
	const first = validateAffirmation(text);
	if (first.ok) return { text, ok: true, reasons: [] };
	try {
		const rewritten = await callModel(
			'writing',
			`You rewrite affirmations to comply with a strict framework.\n${FRAMEWORK}`,
			`Rewrite this affirmation to fix: ${first.reasons.join('; ')}. Keep the meaning and the author's vocabulary. ` +
				`Return ONLY the rewritten affirmation text, nothing else.\n\n"${text}"`,
		);
		const second = validateAffirmation(rewritten);
		return { text: rewritten, ok: second.ok, reasons: second.reasons };
	} catch {
		return { text, ok: false, reasons: first.reasons };
	}
}

// ---------------------------------------------------------------------------
// generate — the affirmation engine (M1)
// ---------------------------------------------------------------------------

const ELEVATE_VOICE = `You are Elevate, Marlon Avery's development coach inside Maverick. Philosophy:
things happen FOR you — not to you. Observe, don't judge. The user's own words matter more than
yours. Balance is personal and self-defined — never prescribe universal amounts or schedules.`;

async function generate(body: { goal_id?: string; seeds?: string[]; replace?: boolean }) {
	const goalQuery = body.goal_id
		? db.from('goals').select('*').eq('id', body.goal_id).maybeSingle()
		: db.from('goals').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
	const { data: goal } = await goalQuery;
	if (!goal) throw new Error('No active destination — declare where you want to go first (chat with Maverick).');

	const [assessment, selfTalk, actives] = await Promise.all([
		db.from('assessments').select('scored_dimensions,discomfort_flags').eq('goal_id', goal.id).order('taken_at', { ascending: false }).limit(1).maybeSingle(),
		db.from('self_talk_samples').select('raw_text,detected_pattern').order('captured_at', { ascending: false }).limit(10),
		db.from('affirmations').select('id,text').eq('status', 'active'),
	]);

	const seeds = (body.seeds ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 3);
	const raw = await callModel(
		'writing',
		`${ELEVATE_VOICE}\n\n${FRAMEWORK}`,
		`Marlon's destination (Place B): "${goal.destination_text}"\n` +
			`Where he is (Place A): ${goal.place_a_summary ?? 'not summarized yet'}\n` +
			`What it's worth to him: ${goal.worth_statement ?? '—'} (commitment: ${goal.commitment_level})\n` +
			`Assessment discomfort areas: ${JSON.stringify(assessment.data?.discomfort_flags ?? [])}\n` +
			`Scored dimensions: ${JSON.stringify(assessment.data?.scored_dimensions ?? {})}\n` +
			`His recent self-talk samples: ${JSON.stringify(selfTalk.data ?? [])}\n` +
			(seeds.length
				? `HIS OWN SEED AFFIRMATIONS (reshape these first, keep his vocabulary):\n${seeds.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n`
				: '') +
			`Current active set (avoid duplicating): ${JSON.stringify((actives.data ?? []).map((a) => a.text))}\n\n` +
			`Write ${seeds.length ? `${seeds.length} reshaped seed(s) plus enough new ones for` : ''} a set of 3 to 5 affirmations ` +
			`targeting (a) the destination, (b) the discomfort areas, (c) negative self-talk patterns. ` +
			`Respond with ONLY a JSON array: [{"text": "...", "target": "goal|discomfort_area|self_talk_pattern|lesson", ` +
			`"target_ref": "short label of what it targets", "rationale": "one sentence", "from_seed": ${seeds.length ? '0-based seed index or null' : 'null'}}]`,
	);

	const drafts = parseJson(raw) as { text: string; target?: string; target_ref?: string; rationale?: string; from_seed?: number | null }[];
	if (!Array.isArray(drafts) || !drafts.length) throw new Error('Generator returned no affirmations');

	const inserted: unknown[] = [];
	const rejected: string[] = [];
	for (const draft of drafts.slice(0, 5)) {
		const checked = await ensureValid(String(draft.text ?? ''));
		if (!checked.ok) {
			rejected.push(`"${draft.text}" (${checked.reasons.join('; ')})`);
			continue;
		}
		const seedIndex = typeof draft.from_seed === 'number' ? draft.from_seed : null;
		const { data, error } = await db
			.from('affirmations')
			.insert({
				text: checked.text,
				goal_id: goal.id,
				target: ['goal', 'discomfort_area', 'self_talk_pattern', 'lesson'].includes(draft.target ?? '') ? draft.target : 'goal',
				target_ref: draft.target_ref ?? null,
				user_seed_text: seedIndex !== null && seeds[seedIndex] ? seeds[seedIndex] : null,
				triggered_by: draft.rationale ?? null,
				version: 1,
				status: 'active',
			})
			.select('id,text,target,target_ref,user_seed_text')
			.single();
		if (error) throw new Error(error.message);
		inserted.push(data);
	}
	if (!inserted.length) throw new Error(`All drafts failed the validator: ${rejected.join(' | ')}`);

	if (body.replace) {
		const keepIds = (inserted as { id: string }[]).map((a) => a.id);
		await db.from('affirmations').update({ status: 'retired' }).eq('status', 'active').not('id', 'in', `(${keepIds.join(',')})`);
	} else {
		// Fewer, deeper: cap the active set at 5 — retire the oldest beyond it.
		const { data: all } = await db.from('affirmations').select('id').eq('status', 'active').order('created_at', { ascending: false });
		const overflow = (all ?? []).slice(5).map((a) => a.id);
		if (overflow.length) await db.from('affirmations').update({ status: 'retired' }).in('id', overflow);
	}

	await audit({
		observed: `goal "${goal.destination_text.slice(0, 80)}", ${seeds.length} seed(s)`,
		recommended: 'generate affirmation set',
		action_taken: `${inserted.length} affirmations passed the validator${rejected.length ? `; ${rejected.length} rejected` : ''}`,
		action_type: 'elevate:generate',
		related_id: goal.id,
	});
	return { affirmations: inserted, rejected };
}

// ---------------------------------------------------------------------------
// rewrite + visualize — clean up the dictated destination, then paint it
// ---------------------------------------------------------------------------

async function loadGoal(goal_id?: string) {
	const query = goal_id
		? db.from('goals').select('*').eq('id', goal_id).maybeSingle()
		: db.from('goals').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
	const { data: goal } = await query;
	if (!goal) throw new Error('No destination found — declare where you want to go first.');
	return goal;
}

async function rewriteGoal(body: { goal_id?: string }) {
	const goal = await loadGoal(body.goal_id);
	const raw = await callModel(
		'rewrite',
		`${ELEVATE_VOICE}\n\nYou clean up dictated text. The user's words matter more than yours: keep his vocabulary, ` +
			`his rhythm, his meaning. Remove transcription artifacts — false starts, filler, duplicated words, mis-heard ` +
			`fragments — fix punctuation, and tighten. Never add ideas, never coach, never inflate. First person stays first person.`,
		`Clean up each field of this dictated destination declaration. Return ONLY JSON in the shape ` +
			`{"destination_text": "...", "worth_statement": "..." | null, "place_a_summary": "..." | null} — ` +
			`null for any field that is empty below.\n\n` +
			`destination_text: ${goal.destination_text}\n` +
			`worth_statement: ${goal.worth_statement ?? '(empty)'}\n` +
			`place_a_summary: ${goal.place_a_summary ?? '(empty)'}`,
	);
	const cleaned = parseJson(raw) as { destination_text?: string; worth_statement?: string | null; place_a_summary?: string | null };
	const destination = String(cleaned.destination_text ?? '').trim();
	if (!destination) throw new Error('Rewrite returned no destination text');
	const patch = {
		destination_text: destination,
		worth_statement: goal.worth_statement ? String(cleaned.worth_statement ?? '').trim() || goal.worth_statement : null,
		place_a_summary: goal.place_a_summary ? String(cleaned.place_a_summary ?? '').trim() || goal.place_a_summary : null,
	};
	const { error } = await db.from('goals').update(patch).eq('id', goal.id);
	if (error) throw new Error(error.message);
	await audit({
		observed: `dictated goal "${goal.destination_text.slice(0, 60)}"`,
		recommended: 'clean up dictation artifacts, keep his words',
		action_taken: `rewrote to "${destination.slice(0, 60)}"`,
		action_type: 'elevate:rewrite',
		related_id: goal.id,
	});
	return { goal_id: goal.id, ...patch };
}

async function visualize(body: { goal_id?: string }) {
	const goal = await loadGoal(body.goal_id);
	const { bytes, mime } = await callImageModel(
		`A cinematic, warmly lit photographic scene that embodies this personal destination as already achieved: ` +
			`"${goal.destination_text}". Grounded and evocative — real places, real light, golden-hour warmth. ` +
			`No recognizable faces, no text or lettering, no logos, no collage. One coherent scene a person ` +
			`would pin above their desk. Landscape 16:9.`,
	);
	const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
	const path = `vision/${goal.id}.${ext}`;
	const { error: uploadError } = await db.storage.from('elevate').upload(path, bytes, { contentType: mime, upsert: true });
	if (uploadError) throw new Error(uploadError.message);
	const { error } = await db.from('goals').update({ vision_image_path: path }).eq('id', goal.id);
	if (error) throw new Error(error.message);
	await audit({
		observed: `destination "${goal.destination_text.slice(0, 60)}"`,
		recommended: 'paint the destination (vision image)',
		action_taken: `stored ${path}`,
		action_type: 'elevate:visualize',
		related_id: goal.id,
	});
	return { goal_id: goal.id, vision_image_path: path };
}

// ---------------------------------------------------------------------------
// adjust — the M3 signal loop. Events carry proposals; Marlon accepts.
// ---------------------------------------------------------------------------

async function openEventExists(type: string): Promise<boolean> {
	const { data } = await db.from('agent_events').select('id').eq('event_type', type).eq('status', 'open').limit(1);
	return (data ?? []).length > 0;
}

async function proposeReshape(affirmation: { id: string; text: string }, why: string): Promise<string | null> {
	try {
		const raw = await callModel(
			'writing',
			`${ELEVATE_VOICE}\n\n${FRAMEWORK}`,
			`This affirmation's resonance is fading: "${affirmation.text}"\nObservation: ${why}\n` +
				`Write ONE reshaped version — same intent, fresher language, still his voice. Return ONLY the affirmation text.`,
		);
		const checked = await ensureValid(raw);
		return checked.ok ? checked.text : null;
	} catch {
		return null;
	}
}

async function adjust() {
	const created: string[] = [];
	const [activesRes, checkinsRes, goalRes] = await Promise.all([
		db.from('affirmations').select('id,text,target,created_at').eq('status', 'active').order('created_at', { ascending: true }),
		db.from('affirmation_checkins').select('type,read,resonance_score,notes_text,behavior_connection,created_at').gte('created_at', daysAgoISO(30)).order('created_at', { ascending: true }),
		db.from('goals').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
	]);
	const actives = activesRes.data ?? [];
	const checkins = checkinsRes.data ?? [];
	const goal = goalRes.data;

	const evenings = checkins.filter((c) => c.type === 'evening' && typeof c.resonance_score === 'number');
	const mornings = checkins.filter((c) => c.type === 'morning' && c.read);

	// --- resonance_decay: last-7-day average meaningfully below the prior 7 ---
	if (actives.length && evenings.length >= 5 && !(await openEventExists('resonance_decay'))) {
		const cut = daysAgoISO(7);
		const recent = evenings.filter((c) => c.created_at! >= cut).map((c) => c.resonance_score!);
		const prior = evenings.filter((c) => c.created_at! < cut).map((c) => c.resonance_score!);
		if (recent.length >= 2 && prior.length >= 2) {
			const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
			if (avg(recent) + 0.5 <= avg(prior)) {
				const oldest = actives[0];
				const observation = `Resonance averaged ${avg(recent).toFixed(1)} this week, down from ${avg(prior).toFixed(1)}.`;
				const proposed = await proposeReshape(oldest, observation);
				await db.from('agent_events').insert({
					event_type: 'resonance_decay',
					payload: { affirmation_id: oldest.id, current_text: oldest.text, proposed_text: proposed, observation },
				});
				created.push('resonance_decay');
			}
		}
	}

	// --- outgrown: read faithfully ~30 days, zero reported behavior connection ---
	if (actives.length && mornings.length >= 20 && evenings.length >= 10 && !(await openEventExists('outgrown'))) {
		if (!evenings.some((c) => c.behavior_connection === true)) {
			const oldest = actives[0];
			const observation = `Read ${mornings.length} mornings in 30 days with no day where it connected to behavior — like a magazine that stopped influencing you.`;
			const proposed = await proposeReshape(oldest, observation);
			await db.from('agent_events').insert({
				event_type: 'outgrown',
				payload: { affirmation_id: oldest.id, current_text: oldest.text, proposed_text: proposed, observation },
			});
			created.push('outgrown');
		}
	}

	// --- classifier pass over recent notes: stall / graduation / goal_drift / new_influence ---
	const notes = checkins.filter((c) => c.notes_text?.trim()).slice(-20).map((c) => ({ when: c.created_at, note: c.notes_text }));
	if (notes.length >= 2 && goal) {
		try {
			const raw = await callModel(
				'reasoning',
				ELEVATE_VOICE,
				`Marlon's destination: "${goal.destination_text}". Active affirmations: ${JSON.stringify(actives.map((a) => ({ id: a.id, text: a.text })))}\n` +
					`His recent check-in notes:\n${JSON.stringify(notes)}\n\n` +
					`Classify. Respond with ONLY JSON: {"stall": {"detected": bool, "pain_point": "…"}, ` +
					`"graduation": {"detected": bool, "affirmation_id": "id or null", "evidence": "…"}, ` +
					`"goal_drift": {"detected": bool, "new_direction_hint": "…"}, ` +
					`"new_influence": {"detected": bool, "label": "…", "quadrant": "relationship|introspective|lessons|media"}}. ` +
					`Only mark detected when the notes clearly support it.`,
			);
			const signals = parseJson(raw);
			if (signals.stall?.detected && !(await openEventExists('stall'))) {
				const lessonText = await proposeReshape(
					{ id: '', text: `A lesson keeps returning: ${signals.stall.pain_point}` },
					'Anchor the lesson so the pain point stops repeating.',
				);
				await db.from('agent_events').insert({
					event_type: 'stall',
					payload: { pain_point: signals.stall.pain_point, proposed_text: lessonText, observation: `This pain point has come up more than once: ${signals.stall.pain_point}` },
				});
				created.push('stall');
			}
			if (signals.graduation?.detected && signals.graduation.affirmation_id && !(await openEventExists('graduation'))) {
				const match = actives.find((a) => a.id === signals.graduation.affirmation_id);
				if (match) {
					await db.from('agent_events').insert({
						event_type: 'graduation',
						payload: { affirmation_id: match.id, current_text: match.text, observation: signals.graduation.evidence },
					});
					created.push('graduation');
				}
			}
			if (signals.goal_drift?.detected && !(await openEventExists('goal_drift'))) {
				await db.from('agent_events').insert({
					event_type: 'goal_drift',
					payload: { hint: signals.goal_drift.new_direction_hint, observation: 'Your language about where you are headed is shifting.' },
				});
				created.push('goal_drift');
			}
			if (signals.new_influence?.detected && !(await openEventExists('new_influence'))) {
				await db.from('agent_events').insert({
					event_type: 'new_influence',
					payload: { label: signals.new_influence.label, quadrant: signals.new_influence.quadrant, observation: `${signals.new_influence.label} keeps showing up in your check-ins.` },
				});
				created.push('new_influence');
			}
		} catch {
			// classifier failure never blocks the rest of the loop
		}
	}

	// --- disengagement: >5 days silent → one observation-framed re-entry, once ---
	if (goal && actives.length && !(await openEventExists('disengagement'))) {
		const { data: latest } = await db.from('affirmation_checkins').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
		const lastSeen = latest?.created_at ?? actives[0].created_at;
		if (lastSeen && lastSeen < daysAgoISO(5)) {
			const worth = goal.commitment_level === 'life_changing' && goal.worth_statement
				? ` You called this "${goal.worth_statement}".`
				: '';
			const message = `It's been a few days since we checked in on where you're headed — no judgment, just an observation.${worth} The morning card is waiting whenever you are.`;
			const title = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TIME_ZONE }).format(new Date());
			let { data: convo } = await db.from('chat_conversations').select('id').eq('title', title).maybeSingle();
			if (!convo) {
				const { data } = await db.from('chat_conversations').insert({ title }).select('id').single();
				convo = data;
			}
			if (convo) await db.from('chat_messages').insert({ conversation_id: convo.id, role: 'assistant', content: message, model: 'elevate' });
			await db.from('agent_events').insert({ event_type: 'disengagement', payload: { message }, status: 'open' });
			created.push('disengagement');
		}
	}

	// --- cadence: weekly (Sunday) reflection + quarterly re-assessment ---
	const dowET = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: TIME_ZONE }).format(new Date());
	if (dowET === 'Sun' && goal) {
		const weekly = checkins.some((c) => c.type === 'weekly' && c.created_at! >= daysAgoISO(6));
		if (!weekly && !(await openEventExists('cadence_due'))) {
			await db.from('agent_events').insert({
				event_type: 'cadence_due',
				payload: { cadence: 'weekly', observation: 'Weekly pulse: two questions — what resonated, what connected to real behavior?' },
			});
			created.push('cadence_due:weekly');
		}
	}
	if (goal) {
		const { data: lastAssessment } = await db.from('assessments').select('taken_at').eq('goal_id', goal.id).order('taken_at', { ascending: false }).limit(1).maybeSingle();
		if (lastAssessment?.taken_at && lastAssessment.taken_at < daysAgoISO(90) && !(await openEventExists('cadence_due'))) {
			await db.from('agent_events').insert({
				event_type: 'cadence_due',
				payload: { cadence: 'quarterly_reassessment', observation: 'A quarter has passed — retake the assessment and see your Place A→B delta.' },
			});
			created.push('cadence_due:quarterly');
		}
	}

	await audit({
		observed: `${actives.length} active affirmations, ${checkins.length} check-ins in 30d`,
		recommended: 'elevate adjustment loop',
		action_taken: created.length ? `events created: ${created.join(', ')}` : 'no signals fired',
		action_type: 'elevate:adjust',
	});
	return { events_created: created };
}

// ---------------------------------------------------------------------------
// resolve_event — Marlon accepts or dismisses a proposal
// ---------------------------------------------------------------------------

async function resolveEvent(body: { event_id?: string; decision?: string }) {
	if (!body.event_id || !['accepted', 'dismissed'].includes(body.decision ?? '')) {
		throw new Error('resolve_event needs event_id and decision (accepted|dismissed)');
	}
	const { data: event } = await db.from('agent_events').select('*').eq('id', body.event_id).maybeSingle();
	if (!event) throw new Error('Event not found');
	if (event.status !== 'open') throw new Error('Event already resolved');

	let actionTaken = 'dismissed';
	if (body.decision === 'accepted') {
		const p = event.payload as Record<string, unknown>;
		switch (event.event_type) {
			case 'resonance_decay':
			case 'outgrown': {
				const oldId = p.affirmation_id as string | undefined;
				const proposed = p.proposed_text as string | undefined;
				if (!proposed) throw new Error('No proposed text on this event');
				const checked = await ensureValid(proposed);
				if (!checked.ok) throw new Error(`Proposal fails the framework: ${checked.reasons.join('; ')}`);
				const { data: parent } = oldId
					? await db.from('affirmations').select('id,version,goal_id,target,target_ref').eq('id', oldId).maybeSingle()
					: { data: null };
				await db.from('affirmations').insert({
					text: checked.text,
					goal_id: parent?.goal_id ?? null,
					target: parent?.target ?? 'goal',
					target_ref: parent?.target_ref ?? null,
					version: (parent?.version ?? 0) + 1,
					parent_affirmation_id: parent?.id ?? null,
					status: 'active',
					triggered_by: p.observation as string ?? event.event_type,
				});
				if (parent) {
					await db.from('affirmations').update({ status: event.event_type === 'outgrown' ? 'retired' : 'reshaped' }).eq('id', parent.id);
				}
				actionTaken = `reshaped → v${(parent?.version ?? 0) + 1}`;
				break;
			}
			case 'graduation': {
				const id = p.affirmation_id as string | undefined;
				if (!id) throw new Error('No affirmation on this event');
				const { data: grad } = await db.from('affirmations').select('id,text,version,goal_id,target,target_ref').eq('id', id).maybeSingle();
				if (!grad) throw new Error('Affirmation not found');
				await db.from('affirmations').update({ status: 'internalized' }).eq('id', grad.id);
				const raw = await callModel(
					'writing',
					`${ELEVATE_VOICE}\n\n${FRAMEWORK}`,
					`This affirmation is now internalized — it reads as plain fact to him: "${grad.text}"\n` +
						`Write ONE next-level affirmation: the same direction, one step closer to Place B, assuming the internalized one as ground truth. Return ONLY the affirmation text.`,
				);
				const next = await ensureValid(raw);
				if (next.ok) {
					await db.from('affirmations').insert({
						text: next.text,
						goal_id: grad.goal_id,
						target: grad.target ?? 'goal',
						target_ref: grad.target_ref,
						version: grad.version + 1,
						parent_affirmation_id: grad.id,
						status: 'active',
						triggered_by: 'graduated — next level',
					});
					actionTaken = 'internalized + next-level generated';
				} else {
					actionTaken = 'internalized (next-level failed validation — generate manually)';
				}
				break;
			}
			case 'stall': {
				const proposed = p.proposed_text as string | undefined;
				if (proposed) {
					const checked = await ensureValid(proposed);
					if (checked.ok) {
						await db.from('affirmations').insert({
							text: checked.text,
							target: 'lesson',
							target_ref: (p.pain_point as string ?? '').slice(0, 120) || null,
							version: 1,
							status: 'active',
							triggered_by: 'lesson-anchored (stall signal)',
						});
						actionTaken = 'lesson-anchored affirmation added';
						break;
					}
				}
				actionTaken = 'accepted (no valid proposal — explore the lesson in chat)';
				break;
			}
			case 'new_influence': {
				await db.from('influences').insert({
					quadrant: (p.quadrant as string) ?? 'relationship',
					label: (p.label as string) ?? 'unnamed influence',
					ai_observations: [{ note: p.observation ?? '', at: new Date().toISOString() }],
					status: 'active',
				});
				actionTaken = 'influence logged for quadrant audit (M4)';
				break;
			}
			default:
				actionTaken = 'acknowledged';
		}
	}

	await db.from('agent_events').update({ status: body.decision, resolved_at: new Date().toISOString(), action_taken: actionTaken }).eq('id', event.id);
	await audit({
		observed: `event ${event.event_type}`,
		recommended: String((event.payload as Record<string, unknown>)?.observation ?? event.event_type),
		action_taken: `${body.decision}: ${actionTaken}`,
		action_type: `elevate:${event.event_type}`,
		related_id: event.id,
	});
	return { status: body.decision, action_taken: actionTaken };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
	const headers = corsHeaders(req.headers.get('origin'));
	if (req.method === 'OPTIONS') return new Response('ok', { headers });
	if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });

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
	if (!authorized) return new Response(JSON.stringify({ error: 'This studio is for MA.' }), { status: 403, headers });

	if (!OPENROUTER_API_KEY) {
		return new Response(
			JSON.stringify({ error: 'missing_openrouter_key', message: 'Add OPENROUTER_API_KEY in Supabase → Edge Functions → Secrets.' }),
			{ status: 400, headers },
		);
	}

	try {
		const body = await req.json().catch(() => ({}));
		const action = body.action as string;
		const result =
			action === 'generate' ? await generate(body)
			: action === 'adjust' ? await adjust()
			: action === 'resolve_event' ? await resolveEvent(body)
			: action === 'rewrite' ? await rewriteGoal(body)
			: action === 'visualize' ? await visualize(body)
			: null;
		if (result === null) return new Response(JSON.stringify({ error: `Unknown action "${action}"` }), { status: 400, headers });
		return new Response(JSON.stringify({ ok: true, result }), { headers });
	} catch (err) {
		console.error('maverick-elevate error:', err);
		return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error' }), { status: 500, headers });
	}
});
