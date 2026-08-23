import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isDedicatedBaselineRoute } from '../workers/api/src/routes';

const baselinePath = new URL('../workers/api/baseline/deployed-2026-08-23.js', import.meta.url);

describe('recovered production API baseline', () => {
  it('retains every dedicated Maverick domain and scheduled handler', async () => {
    const source = await readFile(baselinePath, 'utf8');
    for (const marker of [
      '/api/chat',
      '/api/memories',
      '/api/agent',
      '/api/elevate',
      '/api/snapshot',
      '/api/tasks',
      '/api/goal',
      '/api/media',
      'scheduled(controller',
      'match_maverick_memories',
    ]) {
      expect(source, `missing recovered behavior marker: ${marker}`).toContain(marker);
    }
  });

  it('does not contain obvious credential material', async () => {
    const source = await readFile(baselinePath, 'utf8');
    expect(source).not.toMatch(/sk-proj-[A-Za-z0-9_-]{20,}/);
    expect(source).not.toMatch(/postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i);
  });

  it('exposes only the dedicated recovered route contract', () => {
    for (const [method, route] of [
      ['POST', '/maverick/api/chat'],
      ['POST', '/maverick/api/memories/recall'],
      ['PATCH', '/maverick/api/memories/memory-1'],
      ['DELETE', '/maverick/api/memories/memory-1'],
      ['POST', '/maverick/api/agent/briefing'],
      ['POST', '/maverick/api/agent/review'],
      ['POST', '/maverick/api/elevate/generate'],
      ['GET', '/maverick/api/snapshot'],
      ['GET', '/maverick/api/tasks'],
      ['GET', '/maverick/api/goal'],
      ['GET', '/maverick/api/media/private/image.webp'],
    ]) {
      expect(isDedicatedBaselineRoute(route, method), `${method} ${route}`).toBe(true);
    }

    expect(isDedicatedBaselineRoute('/maverick/api/db/projects/project-1', 'PATCH')).toBe(false);
    expect(isDedicatedBaselineRoute('/maverick/api/memories/forget', 'POST')).toBe(false);
    expect(isDedicatedBaselineRoute('/maverick/api/unknown', 'POST')).toBe(false);
  });
});
