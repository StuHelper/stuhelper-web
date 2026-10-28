// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { hostFetchKey } from '../api/host';
import { useCustody } from './useCustody';
import { useContributions } from './useContributions';

describe('shared host transport', () => {
  it('passes current host credentials to both APIs and clears private state on revocation', async () => {
    let status = 200;
    let credential = 'Bearer fixture-first';
    const network = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.credentials).toBe('same-origin');
      expect(new Headers(init?.headers).get('Authorization')).toBe(credential);
      return new Response(JSON.stringify({ items: [], next_cursor: '' }), { status });
    });
    const fetcher: typeof fetch = (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', credential);
      return network(input, { ...init, headers });
    };
    let custody: ReturnType<typeof useCustody> | undefined;
    let contributions: ReturnType<typeof useContributions> | undefined;
    const app = createApp({ setup() {
      custody = useCustody(true);
      contributions = useContributions(true);
      return () => h('div');
    } }).provide(hostFetchKey, fetcher);
    app.mount(document.createElement('div'));
    try {
      for (let n = 0; n < 20; n++) await Promise.resolve();
      await nextTick();
      if (!custody || !contributions) throw new Error('fixture not mounted');
      expect(custody.data.value).not.toBeNull();
      expect(contributions.data.value).not.toBeNull();
      expect(network.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
        expect.stringContaining('/api/v1/storage/custody/operations'),
        expect.stringContaining('/api/v1/storage-contributions/operations'),
      ]));
      credential = 'Bearer fixture-rotated';
      status = 401;
      await Promise.all([custody.reload(), contributions.reload()]);
      expect(custody.data.value).toBeNull();
      expect(contributions.data.value).toBeNull();
      expect(custody.error.value).toBe('unauthenticated');
      expect(contributions.error.value).toBe('unauthenticated');
    } finally { app.unmount(); }
  });
});
