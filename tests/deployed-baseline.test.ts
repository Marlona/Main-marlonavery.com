import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

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
});
