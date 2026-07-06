/**
 * Shared client for the Maverick Command Center pages.
 *
 * Everything runs in the browser against Supabase: the publishable key is
 * public by design and Row Level Security pins every table to Marlon's
 * authenticated session. AI actions go through the `maverick-agent` edge
 * function, which is the only place secrets live.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../backend';
import type { Database, Enums } from './db-types';

export type DB = SupabaseClient<Database>;

let client: DB | undefined;
export const supabase = (): DB => (client ??= createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY));

/**
 * Wire the MaverickLayout login gate and resolve with the client once a
 * session exists. Every command-center page script starts with:
 *   const db = await initMaverick();
 */
export function initMaverick(): Promise<DB> {
	const db = supabase();
	const gate = document.querySelector<HTMLElement>('[data-mav-gate]')!;
	const studio = document.querySelector<HTMLElement>('[data-mav-studio]')!;
	const loginForm = document.querySelector<HTMLFormElement>('[data-mav-login]')!;
	const loginError = document.querySelector<HTMLElement>('[data-mav-error]')!;

	document.querySelector('[data-mav-signout]')?.addEventListener('click', async () => {
		await db.auth.signOut();
		location.reload();
	});

	return new Promise((resolve) => {
		const enter = () => {
			gate.hidden = true;
			studio.hidden = false;
			resolve(db);
		};

		db.auth.getSession().then(({ data }) => {
			if (data.session) {
				enter();
				return;
			}
			gate.hidden = false;
			loginForm.addEventListener('submit', async (e) => {
				e.preventDefault();
				loginError.hidden = true;
				const email = (document.getElementById('mav-email') as HTMLInputElement).value;
				const password = (document.getElementById('mav-pass') as HTMLInputElement).value;
				const { error } = await db.auth.signInWithPassword({ email, password });
				if (error) {
					loginError.hidden = false;
					return;
				}
				enter();
			});
		});
	});
}

/** Invoke a maverick-agent action, surfacing the function's error message. */
export async function invokeAgent<T = unknown>(db: DB, action: 'daily_briefing' | 'affirmation' | 'weekly_review'): Promise<T> {
	const { data, error } = await db.functions.invoke('maverick-agent', { body: { action } });
	if (error) {
		let message = error.message;
		try {
			const body = await (error as { context?: Response }).context?.json();
			message = body?.message ?? body?.error ?? message;
		} catch {
			// non-JSON error body — keep the generic message
		}
		throw new Error(message);
	}
	return (data as { result: T }).result;
}

// ---------------------------------------------------------------------------
// Domain constants + formatters
// ---------------------------------------------------------------------------

export const PILLAR_LABELS: Record<Enums<'pillar'>, string> = {
	jpmorgan: 'JPMorgan',
	voicepath: 'VoicePath',
	ai_impact: 'AImpact',
	personal: 'Personal',
};

export const PROJECT_STATUSES: Enums<'project_status'>[] = ['active', 'waiting', 'stalled', 'completed', 'archived'];
export const TASK_STATUSES: Enums<'task_status'>[] = ['not_started', 'in_progress', 'waiting', 'done'];
export const PRIORITIES: Enums<'priority'>[] = ['low', 'medium', 'high', 'critical'];

export const ENGAGEMENT_STAGES = [
	'lead',
	'intro',
	'proposal',
	'negotiating',
	'confirmed',
	'signed',
	'invoiced',
	'paid',
	'completed',
	'lost',
] as const;
export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number];

export const STATUS_LABELS: Record<string, string> = {
	not_started: 'Not started',
	in_progress: 'In progress',
	waiting: 'Waiting',
	done: 'Done',
	active: 'Active',
	stalled: 'Stalled',
	completed: 'Completed',
	archived: 'Archived',
};

export const label = (value: string) => STATUS_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Spec §6 prioritization, reduced to the fields tasks actually carry:
 * impact + urgency (1–5 each) plus a priority kicker.
 */
export const priorityScore = (t: { impact_score: number | null; urgency_score: number | null; priority: Enums<'priority'> }) =>
	(t.impact_score ?? 1) + (t.urgency_score ?? 1) + { low: 0, medium: 1, high: 2, critical: 4 }[t.priority];

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const fmtMoney = (n: number | null | undefined) => money.format(n ?? 0);

/** Date-only columns are UTC midnights — always format them in UTC. */
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const fmtDate = (d: string | null | undefined) => (d ? dateFmt.format(new Date(d)) : '—');

/** Today as YYYY-MM-DD in the browser's (Marlon's) timezone. */
export const todayISO = () => new Intl.DateTimeFormat('en-CA').format(new Date());

/** Tiny markdown renderer for briefing content (bold, lists, paragraphs). */
export function renderMarkdown(md: string): string {
	const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	const blocks = md.trim().split(/\n{2,}/);
	return blocks
		.map((block) => {
			const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
			if (lines.length === 1 && /^#{1,4}\s/.test(lines[0])) {
				return `<p class="font-display text-lg font-semibold">${inline(lines[0].replace(/^#{1,4}\s+/, ''))}</p>`;
			}
			if (lines.every((l) => /^(\d+[.)]|[-*•])\s/.test(l))) {
				const ordered = /^\d/.test(lines[0]);
				const items = lines.map((l) => `<li>${inline(l.replace(/^(\d+[.)]|[-*•])\s+/, ''))}</li>`).join('');
				return ordered
					? `<ol class="list-decimal space-y-1 pl-5">${items}</ol>`
					: `<ul class="list-disc space-y-1 pl-5">${items}</ul>`;
			}
			return `<p>${lines.map(inline).join('<br />')}</p>`;
		})
		.join('');
}
