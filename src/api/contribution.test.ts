import { describe, expect, it, vi } from 'vitest';
import example from '../../contracts/contribution.example.json';
import { contributionAPI, ContributionError, parseContribution, parsePolicy, parseStatistics, type Operation } from './contribution';

describe('contribution browser boundary', () => {
  it('drops private fields and rejects unsafe numbers, malformed dates and terms', () => {
    expect(parseContribution({ ...example.page.items[0], credential: 'must-not-appear' })).not.toHaveProperty('credential');
    for (const changes of [{ revision: Number.MAX_SAFE_INTEGER + 1 }, { updated_at: '2030-01-01' }, { state: 'invented-success' }]) expect(() => parseContribution({ ...example.page.items[0], ...changes })).toThrow(ContributionError);
    expect(() => parsePolicy({ ...example.policy, terms: { ...example.policy.terms, url: 'javascript:alert(1)' } })).toThrow(ContributionError);
    expect(() => parseStatistics({ ...example.statistics, available_bytes: -1 })).toThrow(ContributionError);
  });
  it('uses the original key, body and same-origin transport', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(example.page.items[0]), { status: 202 }));
    const api = contributionAPI(fetcher), signal = new AbortController().signal;
    const operation: Operation = { kind: 'command', key: 'original-key', id: 'fixture-contribution', body: { action: 'pause', revision: 1 } };
    await api.execute(operation, signal);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/storage-contributions/fixture-contribution/commands', expect.objectContaining({ signal, credentials: 'same-origin', cache: 'no-store', body: JSON.stringify(operation.body), headers: expect.objectContaining({ 'Idempotency-Key': 'original-key' }) }));
  });
  it.each([401, 403, 409, 503])('classifies status %i without trusting response text', async status => {
    const api = contributionAPI(vi.fn<typeof fetch>().mockResolvedValue(new Response('private provider details', { status })));
    await expect(api.execute({ kind: 'retry', key: 'key', id: 'id', body: { revision: 1 } }, new AbortController().signal)).rejects.toMatchObject({ uncertain: status === 503, code: ({ 401: 'unauthenticated', 403: 'forbidden', 409: 'conflict', 503: 'unavailable' })[status] });
  });
  it('treats malformed success and a mismatched object as uncertain', async () => {
    for (const body of [{}, { ...example.page.items[0], id: 'other' }]) {
      const api = contributionAPI(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 202 })));
      await expect(api.execute({ kind: 'retry', key: 'key', id: 'fixture-contribution', body: { revision: 1 } }, new AbortController().signal)).rejects.toMatchObject({ uncertain: true });
    }
  });
});
