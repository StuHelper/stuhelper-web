import { describe, expect, it, vi } from 'vitest';
import { custodyAPI, CustodyError, parseCustodyBinding, parseCustodyPolicy } from './custody';

const id = '00000000-0000-4000-8000-000000000001';
const item = { id, adapter: 'bhpan', revision: 1, state: 'ready', authorization_expires_at: '2030-01-01T00:00:00Z', request_id: id, last_error: '' };
describe('custody transport', () => {
  it('returns allowlisted fields and rejects invalid expiry, revision and unsafe terms', () => {
    expect(parseCustodyBinding({ ...item, password: 'fixture-only', root: 'private' })).toEqual(item);
    for (const change of [{ revision: 1.2 }, { state: 'enabled' }, { authorization_expires_at: '2030-01-01' }]) expect(() => parseCustodyBinding({ ...item, ...change })).toThrow(CustodyError);
    expect(() => parseCustodyPolicy({ version: 'v1', digest: 'a'.repeat(64), url: 'http://example.invalid', max_term_seconds: 86400 })).toThrow(CustodyError);
  });
  it('treats missing or mismatched mutation responses as uncertain', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...item, request_id: 'wrong' }), { status: 202 }));
    const api = custodyAPI(fetcher), signal = new AbortController().signal;
    await expect(api.resume(parseCustodyBinding(item), signal)).rejects.toMatchObject({ code: 'incompatible', uncertain: true });
    fetcher.mockRejectedValueOnce(new Error('fixture network loss'));
    await expect(api.resume(parseCustodyBinding(item), signal)).rejects.toMatchObject({ code: 'network', uncertain: true });
    fetcher.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(api.resume(parseCustodyBinding(item), signal)).rejects.toMatchObject({ code: 'forbidden', uncertain: false });
  });
  it('queries original request IDs without resending credentials', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(item))), api = custodyAPI(fetcher);
    await api.requestStatus(id, new AbortController().signal);
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/v1/storage/custody/requests/${id}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'same-origin' });
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
  });
});
