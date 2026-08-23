const API_PREFIXES = ['/maverick/api/', '/public/inquiry'] as const;
const R2_MEDIA_PREFIX = '/video/';

function isResolvedRange(range: R2Range): range is { offset: number; length: number } {
  return 'offset' in range && 'length' in range &&
    typeof range.offset === 'number' && typeof range.length === 'number';
}

function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function publicMedia(request: Request, env: Env, path: string): Promise<Response | null> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405 });
  const key = path.replace(/^\//, '');
  const object = await env.PUBLIC_MEDIA.get(key, {
    range: request.headers,
  });
  if (!object) return null;

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (request.headers.get('if-none-match') === object.httpEtag) {
    return securityHeaders(new Response(null, { status: 304, headers }));
  }
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Accept-Ranges', 'bytes');
  if (object.range && isResolvedRange(object.range)) {
    const range = object.range;
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set('Content-Length', String(range.length));
  } else {
    headers.set('Content-Length', String(object.size));
  }
  return securityHeaders(new Response(request.method === 'HEAD' ? null : object.body, {
    status: object.range ? 206 : 200,
    headers,
  }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === 'www.marlonavery.com') {
      url.hostname = 'marlonavery.com';
      return Response.redirect(url.toString(), 308);
    }

    if (API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
      return env.API.fetch(request);
    }

    if (url.pathname.startsWith(R2_MEDIA_PREFIX)) {
      const media = await publicMedia(request, env, url.pathname);
      if (media) return media;
    }

    return securityHeaders(await env.ASSETS.fetch(request));
  },
} satisfies ExportedHandler<Env>;
