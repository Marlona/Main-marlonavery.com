import { authorizeAccess, forbidden, privateMutationAllowed } from './auth';
import { handleDataRequest, openSql } from './db';
import { handleInquiry } from './inquiry';
import type { AppEnv } from './runtime';
import productionBaseline from '../baseline/deployed-2026-08-23.js';

const PRIVATE_PREFIX = '/maverick/api';

function baselineEnvironment(env: AppEnv): AppEnv {
  if (!env.OPENROUTER_KEY) return env;
  return {
    ...env,
    OPENROUTER: { get: async () => env.OPENROUTER_KEY },
  } as AppEnv;
}

function rewriteForBaseline(request: Request): Request {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/maverick\/api/, '/api');
  return new Request(url, request);
}

async function privateHealth(env: AppEnv): Promise<Response> {
  const sql = openSql(env);
  try {
    const [{ now }] = await sql`select now()`;
    return Response.json({ data: { ok: true, db: 'neon-via-hyperdrive', environment: env.ENVIRONMENT, now }, error: null });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const runtimeEnv: AppEnv = env;
    const url = new URL(request.url);
    try {
      if (url.pathname === '/public/inquiry' || url.pathname === '/public/inquiry/') {
        return handleInquiry(request, runtimeEnv, ctx);
      }

      if (url.pathname.startsWith(PRIVATE_PREFIX)) {
        if (!(await authorizeAccess(request, runtimeEnv))) return forbidden();
        if (!privateMutationAllowed(request, runtimeEnv)) {
          return Response.json({ data: null, error: { code: 'invalid_origin', message: 'Private mutations must be same-origin JSON requests.' } }, { status: 403 });
        }
        if (url.pathname === `${PRIVATE_PREFIX}/health`) return privateHealth(runtimeEnv);
        const dataMatch = url.pathname.match(/^\/maverick\/api\/db\/([a-z0-9_]+)\/?$/);
        if (dataMatch) return handleDataRequest(request, runtimeEnv, dataMatch[1]);
        if (url.pathname.startsWith(`${PRIVATE_PREFIX}/db/`)) {
          return Response.json({ data: null, error: { code: 'not_found', message: 'Unknown database route.' } }, { status: 404 });
        }
        return productionBaseline.fetch(rewriteForBaseline(request), baselineEnvironment(runtimeEnv), ctx);
      }

      return Response.json({ error: 'not found' }, { status: 404 });
    } catch (error) {
      console.error(JSON.stringify({ message: 'unhandled api error', path: url.pathname, reason: error instanceof Error ? error.message : 'unknown' }));
      return Response.json({ data: null, error: { code: 'internal_error', message: 'Unexpected server error.' } }, { status: 500 });
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    await productionBaseline.scheduled(controller, baselineEnvironment(env), ctx);
  },
} satisfies ExportedHandler<Env>;
