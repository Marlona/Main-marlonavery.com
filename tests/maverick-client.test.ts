import { beforeEach, describe, expect, it, vi } from 'vitest';
import { maverick } from '../src/lib/maverick/client';

describe('same-origin Maverick data client', () => {
  beforeEach(() => {
    vi.stubGlobal('location', {
      origin: 'https://marlonavery.com',
      pathname: '/maverick/projects',
      assign: vi.fn(),
    });
  });

  it('encodes filtering, ordering, paging, and counts into the typed CRUD contract', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ id: 'p1' }], error: null, meta: { count: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await maverick().from('projects')
      .select('id,name', { count: 'exact' })
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .range(10, 19);

    expect(result.error).toBeNull();
    expect(result.count).toBe(1);
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe('/maverick/api/db/projects');
    expect(JSON.parse(requestUrl.searchParams.get('where') ?? '{}')).toEqual({ status: 'active' });
    expect(requestUrl.searchParams.get('order')).toBe('updated_at.desc.last');
    expect(requestUrl.searchParams.get('limit')).toBe('10');
    expect(requestUrl.searchParams.get('offset')).toBe('10');
  });

  it('sends equality-constrained updates without browser bearer credentials', async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ id: 'p1', name: 'Updated' }], error: null }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await maverick().from('projects').update({ name: 'Updated' }).eq('id', 'p1').select().single();

    expect(result.error).toBeNull();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({ where: { id: 'p1' }, set: { name: 'Updated' } });
  });
});
