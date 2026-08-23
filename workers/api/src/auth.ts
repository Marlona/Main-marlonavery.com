import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AppEnv } from './runtime';

const OWNER_EMAIL = 'hi@marlonavery.com';
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authorizeAccess(request: Request, env: AppEnv): Promise<boolean> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || env.ACCESS_AUD === 'PENDING_ACCESS_APPLICATION') return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return false;

  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  try {
    let jwks = jwksCache.get(issuer);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      jwksCache.set(issuer, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    return typeof payload.email === 'string' && payload.email.toLowerCase() === OWNER_EMAIL;
  } catch (error) {
    console.warn(JSON.stringify({ message: 'access token rejected', reason: error instanceof Error ? error.name : 'unknown' }));
    return false;
  }
}

export function forbidden(): Response {
  return Response.json({ data: null, error: { code: 'forbidden', message: 'This studio is for MA.' } }, { status: 403 });
}

export function privateMutationAllowed(request: Request, env: AppEnv): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return true;
  const allowedOrigins = env.ENVIRONMENT === 'production'
    ? new Set(['https://marlonavery.com', 'https://www.marlonavery.com'])
    : env.ENVIRONMENT === 'staging'
      ? new Set(['https://staging.marlonavery.com'])
      : new Set(['http://localhost:4321', 'http://127.0.0.1:4321']);
  const origin = request.headers.get('Origin');
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (!origin || !allowedOrigins.has(origin) || (fetchSite && fetchSite !== 'same-origin')) return false;
  if (request.method !== 'DELETE') {
    const contentType = request.headers.get('Content-Type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) return false;
  }
  return true;
}
