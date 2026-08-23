import { describe, expect, it, vi } from 'vitest';
import worker from '../workers/web/src/index';

const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as unknown as ExecutionContext;

function environment(apiResponse = new Response('api'), assetResponse = new Response('asset')): Env {
  return {
    ENVIRONMENT: 'production',
    API: { fetch: vi.fn(async () => apiResponse), connect: vi.fn() } as unknown as Fetcher,
    ASSETS: { fetch: vi.fn(async () => assetResponse), connect: vi.fn() } as unknown as Fetcher,
    PUBLIC_MEDIA: { get: vi.fn(async () => null) } as unknown as R2Bucket,
  };
}

describe('Cloudflare web Worker', () => {
  it('forwards private Maverick API requests through the service binding', async () => {
    const env = environment();
    const response = await worker.fetch(new Request('https://marlonavery.com/maverick/api/health'), env, context);

    expect(await response.text()).toBe('api');
    expect(env.API.fetch).toHaveBeenCalledOnce();
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('forwards the public inquiry endpoint through the service binding', async () => {
    const env = environment();
    await worker.fetch(new Request('https://marlonavery.com/public/inquiry', { method: 'POST' }), env, context);

    expect(env.API.fetch).toHaveBeenCalledOnce();
  });

  it('redirects www to the canonical apex domain', async () => {
    const response = await worker.fetch(new Request('https://www.marlonavery.com/writing?topic=ai'), environment(), context);

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://marlonavery.com/writing?topic=ai');
  });

  it('adds browser security headers to static assets', async () => {
    const response = await worker.fetch(new Request('https://marlonavery.com/about'), environment(), context);

    expect(await response.text()).toBe('asset');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('serves ranged public video from the isolated R2 binding', async () => {
    const env = environment();
    env.PUBLIC_MEDIA = {
      get: vi.fn(async () => ({
        body: new Blob(['video']).stream(),
        size: 100,
        range: { offset: 10, length: 5 },
        httpEtag: '"media-etag"',
        writeHttpMetadata: (headers: Headers) => headers.set('content-type', 'video/mp4'),
      })),
    } as unknown as R2Bucket;

    const response = await worker.fetch(new Request('https://marlonavery.com/video/clip.mp4', {
      headers: { Range: 'bytes=10-14' },
    }), env, context);

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-range')).toBe('bytes 10-14/100');
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
