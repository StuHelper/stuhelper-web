// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustodyError, type CustodyBinding, type CustodyRequest } from '../api/custody';
import { useCustody } from './useCustody';
const item: CustodyBinding = { id: 'fixture-id', adapter: 'bhpan', revision: 1, state: 'ready', authorization_expires_at: '2030-01-01T00:00:00Z', request_id: 'fixture-request', last_error: '' };
const body: CustodyRequest = { adapter: 'bhpan', credential: { mode: 'local', username: 'fixture', password: 'test-only-secret' }, consent: { accepted: true, version: 'v1', digest: 'a'.repeat(64) }, until: item.authorization_expires_at };
const disposals: (() => void)[] = [];
afterEach(() => { for (const f of disposals.splice(0)) f(); });
async function settle() { for (let n = 0; n < 10; n++) await Promise.resolve(); await nextTick(); }
function fixture() { return { list: vi.fn().mockResolvedValue({ items: [item], next_cursor: '' }), policy: vi.fn().mockResolvedValue({ version: 'v1', digest: 'a'.repeat(64), url: 'https://example.invalid', max_term_seconds: 86400 }), submit: vi.fn().mockResolvedValue(item), resume: vi.fn().mockResolvedValue(item), requestStatus: vi.fn().mockResolvedValue(item) }; }
function mount(api: ReturnType<typeof fixture>, admin = false) {
  let model: ReturnType<typeof useCustody> | undefined;
  const app = createApp({ setup() { model = useCustody(admin, api); return () => h('div'); } });
  app.mount(document.createElement('div')); disposals.push(() => app.unmount());
  if (!model) throw new Error('fixture failed'); return model;
}
describe('custody request lifecycle', () => {
  it('keeps only an ID after an uncertain submission and recovers by lookup', async () => {
    const api = fixture(); api.submit.mockRejectedValueOnce(new CustodyError('network', true));
    const model = mount(api); await settle(); await model.submit(body);
    const key = model.recovery.value?.key;
    expect(key).toBeTruthy(); expect(Object.keys(model.recovery.value ?? {})).toEqual(['key']);
    expect(JSON.stringify(model.recovery.value)).not.toContain('test-only-secret');
    await model.submit(body); expect(api.submit).toHaveBeenCalledTimes(1);
    await model.recover(); expect(api.requestStatus).toHaveBeenCalledWith(key, expect.any(AbortSignal));
    expect(model.recovery.value).toBeNull(); expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it('clears private data immediately after permission is revoked', async () => {
    const api = fixture(), model = mount(api); await settle(); api.submit.mockRejectedValue(new CustodyError('forbidden'));
    await model.submit(body); expect(model.data.value).toBeNull(); expect(model.recovery.value).toBeNull(); expect(model.error.value).toBe('forbidden');
  });
  it('limits administrators to recovery and ignores stale reads', async () => {
    const api = fixture(); let finish: ((value: { items: CustodyBinding[]; next_cursor: string }) => void) | undefined;
    api.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new CustodyError('unauthenticated'));
    const model = mount(api, true); await model.reload(); finish?.({ items: [item], next_cursor: '' }); await settle();
    await model.submit(body); expect(api.submit).not.toHaveBeenCalled(); expect(api.policy).not.toHaveBeenCalled(); expect(model.data.value).toBeNull();
  });
  it('prevents simultaneous mutations and clears recovery state on disposal', async () => {
    const api = fixture(); let finish: ((value: CustodyBinding) => void) | undefined;
    api.resume.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const model = mount(api, true); await settle(); const visible = model.data.value?.items[0]; if (!visible) throw new Error("missing fixture"); const task = model.resume(visible); await model.resume(visible);
    expect(api.resume).toHaveBeenCalledTimes(1); disposals.pop()?.(); finish?.(item); await task;
    expect(model.data.value).toBeNull(); expect(model.recovery.value).toBeNull();
  });
});
