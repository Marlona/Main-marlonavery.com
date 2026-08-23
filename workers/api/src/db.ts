import postgres from 'postgres';
import type { AppEnv } from './runtime';

const TABLE_COLUMNS: Record<string, readonly string[]> = {
  affirmation_checkins: ['id', 'affirmation_id', 'type', 'read', 'resonance_score', 'notes_text', 'behavior_connection', 'created_at'],
  affirmations: ['id', 'text', 'theme', 'triggered_by', 'created_at', 'goal_id', 'user_seed_text', 'target', 'target_ref', 'version', 'parent_affirmation_id', 'status'],
  agent_events: ['id', 'event_type', 'payload', 'action_taken', 'status', 'created_at', 'resolved_at'],
  approval_queue: ['id', 'action_type', 'source', 'suggested_action', 'reasoning', 'preview', 'status', 'related_project_id', 'created_at', 'resolved_at'],
  assessments: ['id', 'goal_id', 'responses', 'scored_dimensions', 'discomfort_flags', 'taken_at'],
  audit_log: ['id', 'observed', 'recommended', 'action_taken', 'approved', 'action_type', 'related_id', 'created_at'],
  calendar_events: ['id', 'external_id', 'title', 'start_at', 'end_at', 'attendees', 'needs_prep', 'project_id', 'synced_at'],
  chat_conversations: ['id', 'title', 'created_at', 'updated_at', 'summarized_at'],
  chat_messages: ['id', 'conversation_id', 'role', 'content', 'tool_calls', 'model', 'created_at'],
  daily_briefings: ['id', 'date', 'content', 'model', 'created_at'],
  daily_checkins: ['id', 'date', 'most_important', 'avoiding', 'success_looks_like', 'gratitude', 'completed', 'reflection', 'created_at'],
  elevate_drafts: ['id', 'state', 'step', 'created_at', 'updated_at'],
  email_summaries: ['id', 'external_id', 'from_addr', 'subject', 'summary', 'category', 'importance', 'suggested_action', 'project_id', 'synced_at'],
  engagements: ['id', 'event_name', 'organization', 'contact_name', 'contact_email', 'event_date', 'location', 'format', 'topic', 'status', 'fee', 'deposit_paid', 'balance_due', 'contract_signed', 'invoice_sent', 'payment_received', 'prep_status', 'follow_up_needed', 'notes', 'created_at', 'updated_at'],
  goals: ['id', 'destination_text', 'place_a_summary', 'worth_statement', 'commitment_level', 'status', 'created_at', 'revised_at', 'vision_image_path'],
  influences: ['id', 'quadrant', 'label', 'user_alignment_rating', 'ai_observations', 'status', 'created_at', 'updated_at'],
  inquiries: ['id', 'created_at', 'intent', 'name', 'email', 'organization', 'answers', 'source_page', 'status', 'emailed', 'spam', 'spam_reason'],
  maverick_memories: ['id', 'content', 'embedding', 'kind', 'source', 'metadata', 'created_at'],
  projects: ['id', 'name', 'pillar', 'status', 'priority', 'impact', 'deadline', 'next_action', 'revenue_value', 'notes', 'created_at', 'updated_at'],
  revenue_items: ['id', 'source', 'business_line', 'client', 'amount', 'status', 'due_date', 'paid_date', 'stripe_ref', 'engagement_id', 'created_at'],
  self_talk_samples: ['id', 'raw_text', 'detected_pattern', 'sentiment', 'captured_at'],
  subscribers: ['id', 'created_at', 'email', 'source'],
  tasks: ['id', 'project_id', 'title', 'description', 'pillar', 'status', 'priority', 'due_date', 'effort', 'impact_score', 'urgency_score', 'created_at', 'completed_at'],
  weekly_reviews: ['id', 'week_start', 'wins', 'revenue_movement', 'projects_advanced', 'projects_stalled', 'missed_followups', 'lessons', 'next_top3', 'created_at'],
};

const JSON_COLUMNS = new Set([
  'agent_events.payload', 'approval_queue.preview', 'assessments.responses', 'assessments.scored_dimensions',
  'calendar_events.attendees', 'chat_messages.tool_calls', 'daily_checkins.completed', 'elevate_drafts.state',
  'influences.ai_observations', 'inquiries.answers', 'maverick_memories.metadata', 'weekly_reviews.wins',
  'weekly_reviews.projects_advanced', 'weekly_reviews.projects_stalled', 'weekly_reviews.missed_followups', 'weekly_reviews.next_top3',
]);

type Sql = ReturnType<typeof postgres>;
type JsonObject = Record<string, unknown>;
type FilterOperator = 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'notin' | 'is' | 'isnot';
type FilterValue = unknown | { op: FilterOperator; value: unknown };

const isObject = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);

export function openSql(env: AppEnv): Sql {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    types: { date: { to: 1082, from: [1082], serialize: (value: string) => value, parse: (value: string) => value } },
  });
}

function columnsFor(table: string): readonly string[] {
  const columns = TABLE_COLUMNS[table];
  if (!columns) throw new ApiError(404, 'unknown_table', 'Unknown table.');
  return columns;
}

function assertColumn(table: string, column: string): string {
  if (!columnsFor(table).includes(column)) throw new ApiError(400, 'unknown_column', `Unknown column "${column}".`);
  return column;
}

function parseWhere(table: string, raw: unknown): Record<string, FilterValue> {
  if (!isObject(raw)) throw new ApiError(400, 'invalid_filter', 'Filters must be an object.');
  for (const [column, filter] of Object.entries(raw)) {
    assertColumn(table, column);
    if (isObject(filter) && 'op' in filter) {
      const op = filter.op;
		if (!['neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'notin', 'is', 'isnot'].includes(String(op))) {
        throw new ApiError(400, 'invalid_filter', `Unsupported filter operator "${String(op)}".`);
      }
    }
  }
  return raw;
}

export function hasEqualityConstraint(where: Record<string, FilterValue>): boolean {
  return Object.values(where).some((filter) => !isObject(filter) || !('op' in filter));
}

function asParameter(value: unknown): postgres.SerializableParameter {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date || value instanceof Uint8Array) return value;
	if (Array.isArray(value)) return value.map(asParameter);
	throw new ApiError(400, 'invalid_value', 'Filter values must be scalar values or arrays.');
}

function asJson(value: unknown): postgres.JSONValue {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;
	if (Array.isArray(value)) return value.map(asJson);
	if (isObject(value)) {
		const output: Record<string, postgres.JSONValue> = {};
		for (const [key, child] of Object.entries(value)) output[key] = asJson(child);
		return output;
	}
	throw new ApiError(400, 'invalid_json', 'JSON fields contain an unsupported value.');
}

function condition(sql: Sql, column: string, filter: FilterValue) {
  if (isObject(filter) && 'op' in filter) {
    const op = filter.op as FilterOperator;
	const value = filter.value;
	const parameter = value === null ? null : asParameter(value);
	if (op === 'neq') return value === null ? sql`${sql(column)} is not null` : sql`${sql(column)} != ${parameter}`;
	if (op === 'gt') return sql`${sql(column)} > ${parameter}`;
	if (op === 'gte') return sql`${sql(column)} >= ${parameter}`;
	if (op === 'lt') return sql`${sql(column)} < ${parameter}`;
	if (op === 'lte') return sql`${sql(column)} <= ${parameter}`;
	if (op === 'like') return sql`${sql(column)} like ${parameter}`;
	if (op === 'ilike') return sql`${sql(column)} ilike ${parameter}`;
    if (op === 'in') {
      if (!Array.isArray(value) || value.length === 0) throw new ApiError(400, 'invalid_filter', 'The in filter requires values.');
	  return sql`${sql(column)} in ${sql(value.map(asParameter))}`;
    }
	if (op === 'notin') {
	  if (!Array.isArray(value) || value.length === 0) throw new ApiError(400, 'invalid_filter', 'The not-in filter requires values.');
	  return sql`${sql(column)} not in ${sql(value.map(asParameter))}`;
	}
    if (op === 'is') return value === null ? sql`${sql(column)} is null` : sql`${sql(column)} is not null`;
	if (op === 'isnot') return value === null ? sql`${sql(column)} is not null` : sql`${sql(column)} is null`;
  }
  if (filter === null) return sql`${sql(column)} is null`;
	return sql`${sql(column)} = ${asParameter(filter)}`;
}

function whereFragment(sql: Sql, where: Record<string, FilterValue>) {
  let fragment = sql``;
  for (const [index, [column, filter]] of Object.entries(where).entries()) {
    const clause = condition(sql, column, filter);
    fragment = index === 0 ? sql`where ${clause}` : sql`${fragment} and ${clause}`;
  }
  return fragment;
}

function prepareRow(sql: Sql, table: string, value: unknown, allowId = true): Record<string, postgres.ParameterOrJSON<never>> {
  if (!isObject(value)) throw new ApiError(400, 'invalid_body', 'A row object is required.');
	const result: Record<string, postgres.ParameterOrJSON<never>> = {};
  for (const [column, field] of Object.entries(value)) {
    assertColumn(table, column);
    if (!allowId && column === 'id') throw new ApiError(400, 'immutable_column', 'The id column cannot be updated.');
	result[column] = JSON_COLUMNS.has(`${table}.${column}`) && (isObject(field) || Array.isArray(field)) ? sql.json(asJson(field)) : asParameter(field);
  }
  if (Object.keys(result).length === 0) throw new ApiError(400, 'invalid_body', 'At least one field is required.');
  return result;
}

async function boundedJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 131_072) throw new ApiError(413, 'body_too_large', 'Request body is too large.');
  return request.json();
}

class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const success = (data: unknown, status = 200, meta?: Record<string, unknown>) =>
  Response.json({ data, error: null, ...(meta ? { meta } : {}) }, { status });

const failure = (error: unknown) => {
  const known = error instanceof ApiError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'internal_error';
  const message = known ? error.message : 'Unexpected database error.';
  if (!known) console.error(JSON.stringify({ message: 'database request failed', reason: error instanceof Error ? error.message : 'unknown' }));
  return Response.json({ data: null, error: { code, message } }, { status });
};

export async function handleDataRequest(request: Request, env: AppEnv, table: string): Promise<Response> {
  const sql = openSql(env);
  try {
    const allowedColumns = columnsFor(table);
    const url = new URL(request.url);

    if (request.method === 'GET') {
      let whereRaw: unknown = {};
      try { whereRaw = JSON.parse(url.searchParams.get('where') ?? '{}'); } catch { throw new ApiError(400, 'invalid_filter', 'Filters are not valid JSON.'); }
      const where = parseWhere(table, whereRaw);
      const selectParam = url.searchParams.get('select') ?? '*';
      const selected = selectParam === '*' ? allowedColumns : selectParam.split(',').map((column) => assertColumn(table, column.trim()));
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200), 0), 1000);
      const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0);
      const countRequested = url.searchParams.get('count') === 'exact';
      const head = url.searchParams.get('head') === 'true';
      const whereSql = whereFragment(sql, where);
      let orderSql = sql``;
      const order = url.searchParams.get('order');
      if (order) {
        const [column, direction = 'asc', nulls = 'last'] = order.split('.');
        assertColumn(table, column);
        if (!['asc', 'desc'].includes(direction) || !['first', 'last'].includes(nulls)) throw new ApiError(400, 'invalid_order', 'Invalid order expression.');
        orderSql = sql`order by ${sql(column)} ${direction === 'asc' ? sql`asc` : sql`desc`} ${nulls === 'first' ? sql`nulls first` : sql`nulls last`}`;
      }
      const rows = head ? [] : await sql`select ${sql(selected)} from ${sql(table)} ${whereSql} ${orderSql} limit ${limit} offset ${offset}`;
      let count: number | undefined;
      if (countRequested) {
        const [row] = await sql`select count(*)::int as count from ${sql(table)} ${whereSql}`;
        count = Number(row?.count ?? 0);
      }
      return success(rows, 200, countRequested ? { count } : undefined);
    }

    if (request.method === 'POST') {
      const body = await boundedJson(request);
      const rows = Array.isArray(body) ? body.map((row) => prepareRow(sql, table, row)) : [prepareRow(sql, table, body)];
      const inserted = await sql`insert into ${sql(table)} ${sql(rows)} returning *`;
      return success(Array.isArray(body) ? inserted : inserted[0], 201);
    }

    if (request.method === 'PATCH') {
      const body = await boundedJson(request);
      if (!isObject(body)) throw new ApiError(400, 'invalid_body', 'An update body is required.');
      const where = parseWhere(table, body.where);
      if (!hasEqualityConstraint(where)) throw new ApiError(400, 'unsafe_mutation', 'Updates require an equality constraint.');
      const set = prepareRow(sql, table, body.set, false);
      const rows = await sql`update ${sql(table)} set ${sql(set)} ${whereFragment(sql, where)} returning *`;
      return success(rows);
    }

    if (request.method === 'DELETE') {
      const body = await boundedJson(request);
      if (!isObject(body)) throw new ApiError(400, 'invalid_body', 'A delete body is required.');
      const where = parseWhere(table, body.where);
      if (!hasEqualityConstraint(where)) throw new ApiError(400, 'unsafe_mutation', 'Deletes require an equality constraint.');
      const rows = await sql`delete from ${sql(table)} ${whereFragment(sql, where)} returning *`;
      return success(rows);
    }

    if (request.method === 'PUT') {
      const body = await boundedJson(request);
      if (!isObject(body)) throw new ApiError(400, 'invalid_body', 'An upsert body is required.');
      const row = prepareRow(sql, table, body.row);
      const conflict = typeof body.onConflict === 'string' ? assertColumn(table, body.onConflict) : 'id';
      const update = { ...row };
      delete update[conflict];
      const [saved] = Object.keys(update).length
        ? await sql`insert into ${sql(table)} ${sql(row)} on conflict (${sql(conflict)}) do update set ${sql(update)} returning *`
        : await sql`insert into ${sql(table)} ${sql(row)} on conflict (${sql(conflict)}) do nothing returning *`;
      return success(saved ?? null);
    }

    throw new ApiError(405, 'method_not_allowed', 'Method not allowed.');
  } catch (error) {
    return failure(error);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
