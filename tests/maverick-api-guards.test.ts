import { describe, expect, it, vi } from 'vitest';
import { authorizeAccess } from '../workers/api/src/auth';
import { hasEqualityConstraint } from '../workers/api/src/db';
import { handleInquiry, verifyTurnstile } from '../workers/api/src/inquiry';

describe('Maverick API security guards', () => {
  it('fails closed when Access is not configured', async () => {
    const env = {
      ACCESS_TEAM_DOMAIN: 'broad-dust-cbb8.cloudflareaccess.com',
      ACCESS_AUD: 'PENDING_ACCESS_APPLICATION',
    } as never;
    const request = new Request('https://marlonavery.com/maverick/api/health');

    await expect(authorizeAccess(request, env)).resolves.toBe(false);
  });

  it('fails closed when the Access assertion is missing', async () => {
    const env = {
      ACCESS_TEAM_DOMAIN: 'broad-dust-cbb8.cloudflareaccess.com',
      ACCESS_AUD: 'configured-audience',
    } as never;
    const request = new Request('https://marlonavery.com/maverick/api/health');

    await expect(authorizeAccess(request, env)).resolves.toBe(false);
  });

  it('allows only equality-constrained mutations', () => {
    expect(hasEqualityConstraint({ id: 'one' })).toBe(true);
    expect(hasEqualityConstraint({ status: { op: 'neq', value: 'done' } })).toBe(false);
    expect(hasEqualityConstraint({ created_at: { op: 'gte', value: '2026-01-01' } })).toBe(false);
    expect(hasEqualityConstraint({})).toBe(false);
  });

  it('rejects inquiry origins before touching storage', async () => {
    const response = await handleInquiry(
      new Request('https://marlonavery.com/public/inquiry', { method: 'POST', headers: { Origin: 'https://attacker.example' } }),
      { ENVIRONMENT: 'production' } as never,
      {} as never,
    );

    expect(response.status).toBe(403);
  });

  it('does not allow production and staging inquiry origins to cross environments', async () => {
    const production = await handleInquiry(
      new Request('https://marlonavery.com/public/inquiry', { method: 'OPTIONS', headers: { Origin: 'https://staging.marlonavery.com' } }),
      { ENVIRONMENT: 'production' } as never,
      {} as never,
    );
    const staging = await handleInquiry(
      new Request('https://staging.marlonavery.com/public/inquiry', { method: 'OPTIONS', headers: { Origin: 'https://marlonavery.com' } }),
      { ENVIRONMENT: 'staging' } as never,
      {} as never,
    );

    expect(production.status).toBe(403);
    expect(staging.status).toBe(403);
  });

  it('accepts only a successful inquiry Turnstile action on an allowed hostname', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, action: 'inquiry', hostname: 'staging.marlonavery.com' })));
    const env = { TURNSTILE_SECRET: 'not-a-real-secret', TURNSTILE_HOSTNAMES: 'staging.marlonavery.com' } as never;
    const request = new Request('https://staging.marlonavery.com/public/inquiry', {
      headers: { 'CF-Connecting-IP': '192.0.2.1' },
    });

    await expect(verifyTurnstile(request, env, 'test-token')).resolves.toBe(true);

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, action: 'login', hostname: 'staging.marlonavery.com' })));
    await expect(verifyTurnstile(request, env, 'test-token')).resolves.toBe(false);
  });
});
