/**
 * Compare the legacy Postgres database with Neon and optionally merge safe deltas.
 *
 * Required environment variables:
 *   SOURCE_DATABASE_URL  Legacy read-only Postgres connection string
 *   TARGET_DATABASE_URL  Neon branch connection string
 *
 * This command is always a dry run unless RECONCILE_APPLY=1 is explicitly set.
 * It never deletes rows. Mutable records update only when source.updated_at is newer.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import postgres from 'postgres';

const TABLES = [
  'affirmation_checkins', 'affirmations', 'agent_events', 'approval_queue', 'assessments',
  'audit_log', 'calendar_events', 'chat_conversations', 'chat_messages', 'daily_briefings',
  'daily_checkins', 'elevate_drafts', 'email_summaries', 'engagements', 'goals', 'influences',
  'inquiries', 'inquiry_throttle', 'maverick_memories', 'projects', 'revenue_items',
  'self_talk_samples', 'subscribers', 'tasks', 'weekly_reviews',
];

const MUTABLE_BY_UPDATED_AT = new Set([
  'chat_conversations', 'elevate_drafts', 'engagements', 'influences', 'projects',
]);

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  throw new Error('SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required. Do not paste either value into logs.');
}

const apply = process.env.RECONCILE_APPLY === '1';
const reportPath = process.env.RECONCILIATION_REPORT ?? 'reconciliation-report.json';
const expectedTargetHost = process.env.RECONCILE_TARGET_HOST;
if (apply && (!expectedTargetHost || new URL(targetUrl).hostname !== expectedTargetHost)) {
  throw new Error('Apply mode requires RECONCILE_TARGET_HOST to exactly match the target connection hostname.');
}
const source = postgres(sourceUrl, { max: 2, prepare: false });
const target = postgres(targetUrl, { max: 2, prepare: false });

function normalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
  }
  return value;
}

const digest = (value) => createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');

async function schema(sql, table) {
  const columns = await sql`
    select column_name, data_type, udt_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by ordinal_position`;
  const primaryKey = await sql`
    select a.attname as column_name
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = ${`public.${table}`}::regclass and i.indisprimary
    order by array_position(i.indkey, a.attnum)`;
  return { columns: normalize(columns), primaryKey: primaryKey.map((row) => row.column_name) };
}

async function rowsByPrimaryKey(sql, table, primaryKey) {
  const rows = await sql`select * from ${sql(table)} order by ${sql(primaryKey)}`;
  return new Map(rows.map((row) => [String(row[primaryKey]), normalize(row)]));
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? 'apply' : 'dry-run',
  source: 'legacy-postgres',
  target: 'neon',
  tables: {},
  totals: { sourceRows: 0, targetRows: 0, missingInTarget: 0, updatesAppliedOrPlanned: 0, conflicts: 0 },
  applyStatus: apply ? 'pending' : 'not-requested',
};

async function reconcile(targetSql) {
  for (const table of TABLES) {
    const [sourceSchema, targetSchema] = await Promise.all([schema(source, table), schema(targetSql, table)]);
    const schemaMatches = digest(sourceSchema) === digest(targetSchema);
    const sourcePrimaryKeys = sourceSchema.primaryKey;
    const targetPrimaryKeys = targetSchema.primaryKey;
    const primaryKey = sourcePrimaryKeys.length === 1 ? sourcePrimaryKeys[0] : null;
    const entry = {
      schemaMatches,
      sourceSchemaDigest: digest(sourceSchema),
      targetSchemaDigest: digest(targetSchema),
      primaryKey: primaryKey ?? null,
      sourceRows: 0,
      targetRows: 0,
      sourceDigest: null,
      targetDigest: null,
      inserted: [],
      updated: [],
      conflicts: [],
    };
    report.tables[table] = entry;

    if (!schemaMatches || !primaryKey || targetPrimaryKeys.length !== 1 || targetPrimaryKeys[0] !== primaryKey) {
      entry.conflicts.push({ kind: 'schema', message: 'Schema or single-column primary-key mismatch; table was not reconciled.' });
      report.totals.conflicts += 1;
      continue;
    }

    const [sourceRows, targetRows] = await Promise.all([
      rowsByPrimaryKey(source, table, primaryKey),
      rowsByPrimaryKey(targetSql, table, primaryKey),
    ]);
    entry.sourceRows = sourceRows.size;
    entry.targetRows = targetRows.size;
    entry.sourceDigest = digest([...sourceRows.values()]);
    entry.targetDigest = digest([...targetRows.values()]);
    report.totals.sourceRows += sourceRows.size;
    report.totals.targetRows += targetRows.size;

    for (const [id, sourceRow] of sourceRows) {
      const targetRow = targetRows.get(id);
      if (!targetRow) {
        entry.inserted.push(id);
        report.totals.missingInTarget += 1;
        if (apply) await targetSql`insert into ${targetSql(table)} ${targetSql(sourceRow)} on conflict (${targetSql(primaryKey)}) do nothing`;
        continue;
      }
      if (digest(sourceRow) === digest(targetRow)) continue;

      if (MUTABLE_BY_UPDATED_AT.has(table)) {
        const sourceUpdated = Date.parse(String(sourceRow.updated_at ?? ''));
        const targetUpdated = Date.parse(String(targetRow.updated_at ?? ''));
        if (Number.isFinite(sourceUpdated) && Number.isFinite(targetUpdated) && sourceUpdated > targetUpdated) {
          entry.updated.push(id);
          report.totals.updatesAppliedOrPlanned += 1;
          if (apply) {
            const values = { ...sourceRow };
            delete values[primaryKey];
            await targetSql`update ${targetSql(table)} set ${targetSql(values)} where ${targetSql(primaryKey)} = ${sourceRow[primaryKey]}`;
          }
          continue;
        }
      }

      entry.conflicts.push({
        kind: 'row',
        primaryKey: id,
        sourceDigest: digest(sourceRow),
        targetDigest: digest(targetRow),
        resolution: 'target-preserved',
      });
      report.totals.conflicts += 1;
    }
  }
}

let reconciliationError;
try {
  if (apply) {
    await target.begin(async (transaction) => {
      await reconcile(transaction);
      if (report.totals.conflicts > 0) throw new Error('Reconciliation conflicts detected; transaction rolled back.');
    });
    report.applyStatus = 'committed';
  } else {
    await reconcile(target);
  }
} catch (error) {
  reconciliationError = error;
  report.applyStatus = apply ? 'rolled-back' : 'failed';
} finally {
  await Promise.allSettled([source.end({ timeout: 5 }), target.end({ timeout: 5 })]);
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ mode: report.mode, reportPath, totals: report.totals }, null, 2));
if (reconciliationError) throw reconciliationError;
if (report.totals.conflicts > 0) {
  console.error('Reconciliation conflicts require documented resolution; see the report.');
  process.exitCode = 2;
}
