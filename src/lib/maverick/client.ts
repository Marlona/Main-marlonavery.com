/** Same-origin Cloudflare API client for the Maverick Command Center. */
import type { Database, Enums } from './db-types';

type Tables = Database['public']['Tables'];
type TableName = keyof Tables & string;
type TableRow<T extends TableName> = Tables[T] extends { Row: infer Row } ? Row : never;
type ApiError = { code: string; message: string };
type QueryResult<T> = { data: T; error: ApiError | null; count: number | null };
type Filter = unknown | { op: string; value: unknown };
type Mode = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

type ApiEnvelope = {
	data?: unknown;
	error?: ApiError | null;
	meta?: { count?: number };
};

class QueryBuilder<T extends TableName> implements PromiseLike<QueryResult<TableRow<T>[]>> {
	private mode: Mode = 'select';
	private columns = '*';
	private where: Record<string, Filter> = {};
	private orderBy: string | undefined;
	private row: unknown;
	private countRequested = false;
	private head = false;
	private rowLimit = 200;
	private rowOffset = 0;
	private conflictColumn: string | undefined;

	constructor(private readonly table: T) {}

	select(columns = '*', options?: { count?: 'exact'; head?: boolean }): this {
		this.columns = columns;
		this.countRequested = options?.count === 'exact';
		this.head = options?.head === true;
		return this;
	}

	insert(value: Tables[T] extends { Insert: infer Insert } ? Insert | Insert[] : unknown): this {
		this.mode = 'insert';
		this.row = value;
		return this;
	}

	update(value: Tables[T] extends { Update: infer Update } ? Update : unknown): this {
		this.mode = 'update';
		this.row = value;
		return this;
	}

	delete(): this {
		this.mode = 'delete';
		return this;
	}

	upsert(value: Tables[T] extends { Insert: infer Insert } ? Insert : unknown, options?: { onConflict?: string }): this {
		this.mode = 'upsert';
		this.row = value;
		this.conflictColumn = options?.onConflict;
		return this;
	}

	eq(column: string, value: unknown): this { this.where[column] = value; return this; }
	neq(column: string, value: unknown): this { this.where[column] = { op: 'neq', value }; return this; }
	gt(column: string, value: unknown): this { this.where[column] = { op: 'gt', value }; return this; }
	gte(column: string, value: unknown): this { this.where[column] = { op: 'gte', value }; return this; }
	lt(column: string, value: unknown): this { this.where[column] = { op: 'lt', value }; return this; }
	lte(column: string, value: unknown): this { this.where[column] = { op: 'lte', value }; return this; }
	like(column: string, value: string): this { this.where[column] = { op: 'like', value }; return this; }
	ilike(column: string, value: string): this { this.where[column] = { op: 'ilike', value }; return this; }
	is(column: string, value: unknown): this { this.where[column] = { op: 'is', value }; return this; }
	in(column: string, value: readonly unknown[]): this { this.where[column] = { op: 'in', value: [...value] }; return this; }
	not(column: string, operator: 'is' | 'in' | string, value: unknown): this {
		this.where[column] = { op: operator === 'is' ? 'isnot' : operator === 'in' ? 'notin' : 'neq', value };
		return this;
	}

	order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
		this.orderBy = `${column}.${options?.ascending === false ? 'desc' : 'asc'}.${options?.nullsFirst ? 'first' : 'last'}`;
		return this;
	}

	limit(value: number): this { this.rowLimit = value; return this; }
	range(from: number, to: number): this { this.rowOffset = from; this.rowLimit = Math.max(to - from + 1, 0); return this; }

	async single(): Promise<QueryResult<TableRow<T>>> {
		return this.executeOne(false);
	}

	async maybeSingle(): Promise<QueryResult<TableRow<T> | null>> {
		const result = await this.executeMany();
		if (result.error) return { data: null, error: result.error, count: result.count };
		const rows = result.data;
		if (rows.length <= 1) return { data: rows[0] ?? null, error: null, count: result.count };
		return { data: null, error: { code: 'row_count', message: `Expected at most one row, received ${rows.length}.` }, count: result.count };
	}

	then<TResult1 = QueryResult<TableRow<T>[]>, TResult2 = never>(
		onfulfilled?: ((value: QueryResult<TableRow<T>[]>) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
	): Promise<TResult1 | TResult2> {
		return this.executeMany().then(onfulfilled, onrejected);
	}

	private async request(): Promise<QueryResult<unknown>> {
		const url = new URL(`/maverick/api/db/${this.table}`, location.origin);
		const headers = new Headers({ 'Content-Type': 'application/json' });
		let method = 'GET';
		let body: string | undefined;

		if (this.mode === 'select') {
			url.searchParams.set('select', this.columns);
			url.searchParams.set('where', JSON.stringify(this.where));
			url.searchParams.set('limit', String(this.rowLimit));
			url.searchParams.set('offset', String(this.rowOffset));
			if (this.orderBy) url.searchParams.set('order', this.orderBy);
			if (this.countRequested) url.searchParams.set('count', 'exact');
			if (this.head) url.searchParams.set('head', 'true');
		} else if (this.mode === 'insert') {
			method = 'POST';
			body = JSON.stringify(this.row);
		} else if (this.mode === 'update') {
			method = 'PATCH';
			body = JSON.stringify({ where: this.where, set: this.row });
		} else if (this.mode === 'delete') {
			method = 'DELETE';
			body = JSON.stringify({ where: this.where });
		} else {
			method = 'PUT';
			body = JSON.stringify({ row: this.row, onConflict: this.conflictColumn });
		}

		try {
			const response = await fetch(url, { method, headers, body, credentials: 'same-origin' });
			const parsed: unknown = await response.json().catch(() => null);
			const envelope: ApiEnvelope = parsed && typeof parsed === 'object' ? parsed as ApiEnvelope : {};
			if (!response.ok || envelope.error) {
				return {
					data: null,
					error: envelope.error ?? { code: `http_${response.status}`, message: `Request failed (${response.status}).` },
					count: envelope.meta?.count ?? null,
				};
			}
			return { data: envelope.data ?? null, error: null, count: envelope.meta?.count ?? null };
		} catch (error) {
			return { data: null, error: { code: 'network_error', message: error instanceof Error ? error.message : 'Network error.' }, count: null };
		}
	}

	private async executeMany(): Promise<QueryResult<TableRow<T>[]>> {
		const result = await this.request();
		if (result.error) return { data: [], error: result.error, count: result.count };
		const rows = result.data === null ? [] : Array.isArray(result.data) ? result.data : [result.data];
		return { data: rows as TableRow<T>[], error: null, count: result.count };
	}

	private async executeOne(_optional: boolean): Promise<QueryResult<TableRow<T>>> {
		const result = await this.executeMany();
		if (result.error) return { data: null as TableRow<T>, error: result.error, count: result.count };
		const rows = result.data;
		if (rows.length === 1) return { data: rows[0], error: null, count: result.count };
		return { data: null as TableRow<T>, error: { code: 'row_count', message: `Expected one row, received ${rows.length}.` }, count: result.count };
	}
}

class MaverickClient {
	from<T extends TableName>(table: T): QueryBuilder<T> { return new QueryBuilder(table); }

	readonly storage = {
		from: (_bucket: string) => ({
			createSignedUrl: async (path: string, _expiresIn: number) => ({
				data: { signedUrl: `/maverick/api/media/${encodeURIComponent(path)}` },
				error: null as ApiError | null,
			}),
		}),
	};
}

export type DB = MaverickClient;
let client: DB | undefined;
export const maverick = (): DB => (client ??= new MaverickClient());

/**
 * Cloudflare Access authenticates before this page is served. Every page starts with:
 *   const db = await initMaverick();
 */
export function initMaverick(): Promise<DB> {
	const db = maverick();
	document.querySelector('[data-mav-signout]')?.addEventListener('click', () => {
		location.assign('/cdn-cgi/access/logout');
	});
	return Promise.resolve(db);
}

/** Invoke a dedicated Maverick Worker action. */
export async function invokeFn<T = unknown>(_db: DB, fn: string, body: Record<string, unknown>): Promise<T> {
	const action = String(body.action ?? '');
	const payload = { ...body };
	delete payload.action;
	let path: string;
	let method = 'POST';
	if (fn === 'maverick-agent') {
		path = action === 'daily_briefing' ? 'agent/briefing' : action === 'weekly_review' ? 'agent/review' : `agent/${action}`;
	} else if (fn === 'maverick-elevate') {
		path = `elevate/${action}`;
	} else if (fn === 'maverick-memory') {
		path = action === 'update' || action === 'delete' ? `memories/${encodeURIComponent(String(payload.id ?? ''))}` : `memories/${action}`;
		if (action === 'update') method = 'PATCH';
		if (action === 'delete') method = 'DELETE';
		delete payload.id;
	} else {
		throw new Error(`Unknown Maverick action service: ${fn}`);
	}
	const response = await fetch(`/maverick/api/${path}`, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: method === 'DELETE' ? undefined : JSON.stringify(payload),
		credentials: 'same-origin',
	});
	const data: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const error = data && typeof data === 'object' ? data as { message?: string; error?: string } : null;
		throw new Error(error?.message ?? error?.error ?? `Maverick action failed (${response.status}).`);
	}
	return data as T;
}

export const invokeAgent = <T = unknown>(db: DB, action: 'daily_briefing' | 'affirmation' | 'weekly_review'): Promise<T> =>
	invokeFn<T>(db, 'maverick-agent', { action });

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

/** Tiny markdown renderer for briefings and chat replies (bold, inline/fenced code, lists, headings). */
export function renderMarkdown(md: string): string {
	const inline = (s: string) =>
		esc(s)
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/`([^`]+)`/g, '<code class="rounded bg-ink/60 px-1.5 py-0.5 font-mono text-[0.85em]">$1</code>');

	const renderText = (text: string) =>
		text
			.trim()
			.split(/\n{2,}/)
			.filter(Boolean)
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

	// Pull fenced code blocks out first so their contents stay verbatim
	const out: string[] = [];
	const fence = /```\w*\n?([\s\S]*?)```/g;
	let cursor = 0;
	for (let m = fence.exec(md); m; m = fence.exec(md)) {
		if (m.index > cursor) out.push(renderText(md.slice(cursor, m.index)));
		out.push(
			`<pre class="overflow-x-auto rounded-xl bg-ink/80 p-4 font-mono text-xs leading-relaxed"><code>${esc(m[1].replace(/\n$/, ''))}</code></pre>`,
		);
		cursor = m.index + m[0].length;
	}
	if (cursor < md.length) out.push(renderText(md.slice(cursor)));
	return out.join('');
}
