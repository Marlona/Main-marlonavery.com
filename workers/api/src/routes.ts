const PRIVATE_PREFIX = '/maverick/api';

/** Routes intentionally retained from the recovered production Worker. */
export function isDedicatedBaselineRoute(pathname: string, method: string): boolean {
  if (method === 'POST' && pathname === `${PRIVATE_PREFIX}/chat`) return true;
  if (method === 'POST' && /^\/maverick\/api\/memories\/(recall|remember|reembed)$/.test(pathname)) return true;
  if (['PATCH', 'DELETE'].includes(method) && /^\/maverick\/api\/memories\/[^/]+$/.test(pathname)) return true;
  if (method === 'POST' && /^\/maverick\/api\/agent\/(briefing|review|distill)$/.test(pathname)) return true;
  if (method === 'POST' && /^\/maverick\/api\/elevate\/(generate|rewrite|visualize|adjust|resolve_event)$/.test(pathname)) return true;
  if (method === 'GET' && /^\/maverick\/api\/(snapshot|tasks|goal)$/.test(pathname)) return true;
  if (method === 'GET' && pathname.startsWith(`${PRIVATE_PREFIX}/media/`)) return true;
  return false;
}
