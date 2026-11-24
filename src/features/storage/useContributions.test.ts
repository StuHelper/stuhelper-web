// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import example from '../../../contracts/contribution.example.json';
import { ContributionError, parsePage, parsePolicy, parseStatistics } from '../../api/contribution';
import { pollDelays } from './polling';
import { useContributions } from './useContributions';

const disposals: (() => void)[] = [];
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); });
async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); await nextTick(); }
function fixture() {
  return { metrics: vi.fn(), list: vi.fn().mockResolvedValue(parsePage(example.page)), options: vi.fn().mockResolvedValue(example.options), policy: vi.fn().mockResolvedValue(parsePolicy(example.policy)), statistics: vi.fn().mockResolvedValue(parseStatistics(example.statistics)), get: vi.fn(), execute: vi.fn() };
}
function mount(api: ReturnType<typeof fixture>, admin = false) {
  let model: ReturnType<typeof useContributions> | undefined;
  const app = createApp({ setup() { model = useContributions(admin, api); return () => h('div'); } });
  app.mount(document.createElement('div')); disposals.push(() => app.unmount());
  if (!model) throw new Error('fixture failed'); return model;
}
describe('contribution request lifecycle', () => {
  it('snapshots requests and locks uncertain mutations until the same request succeeds', async () => {
    const api = fixture(); api.execute.mockRejectedValueOnce(new ContributionError('network', true)).mockResolvedValue(undefined);
    const model = mount(api); await settle();
    const body = { revision: 1, action: 'pause' as const };
    model.prepare({ kind: 'command', id: 'fixture-contribution', key: 'key', body }); body.revision = 99;
    await model.submit(); model.cancel(); await model.reload();
    expect(model.pending.value?.kind === 'command' && model.pending.value.body.revision).toBe(1);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(model.uncertain.value).toBe(true);
    await model.submit(); expect(api.execute.mock.calls[1]?.[0]).toEqual(api.execute.mock.calls[0]?.[0]);
    expect(model.pending.value).toBeNull(); expect(model.completed.value).toBe(true);
  });
  it('clears private data on revoked permission while keeping public statistics separate', async () => {
    const api = fixture(), model = mount(api); await settle();
    api.execute.mockRejectedValue(new ContributionError('forbidden'));
    model.prepare({ kind: 'retry', id: 'id', key: 'key', body: { revision: 1 } }); await model.submit();
    expect(model.data.value).toBeNull(); expect(model.options.value).toBeNull(); expect(model.pending.value).toBeNull(); expect(model.statistics.value).not.toBeNull();
  });
  it('ignores a late private read and never loads owner options for administrators', async () => {
    const api = fixture(); let resolve: ((value: ReturnType<typeof parsePage>) => void) | undefined;
    api.list.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockRejectedValueOnce(new ContributionError('unauthenticated'));
    const model = mount(api, true); await model.reload(); resolve?.(parsePage(example.page)); await settle();
    expect(model.data.value).toBeNull(); expect(model.error.value).toBe('unauthenticated'); expect(api.options).not.toHaveBeenCalled(); expect(api.policy).not.toHaveBeenCalled();
  });
  it('blocks parallel submits and clears on disposal', async () => {
    const api = fixture(); let resolve: (() => void) | undefined;
    api.execute.mockImplementation(() => new Promise<void>(r => { resolve = r; }));
    const model = mount(api); await settle();
    model.prepare({ kind: 'retry', id: 'id', key: 'key', body: { revision: 1 } }); const first = model.submit(); await model.submit();
    expect(api.execute).toHaveBeenCalledTimes(1); disposals.pop()?.(); resolve?.(); await first;
    expect(model.data.value).toBeNull(); expect(model.pending.value).toBeNull();
  });
});
describe('contribution status refresh', () => {
  afterEach(() => { vi.useRealTimers(); });
  const page = (state: string, revision = 1, applied = 1) => parsePage({ ...example.page, items: [{ ...example.page.items[0], state, revision, applied_revision: applied }] });
  it('re-reads the page in place until the accepted change is applied', async () => {
    vi.useFakeTimers();
    const api = fixture();
    api.list.mockReset().mockResolvedValueOnce(page('active', 2, 1)).mockRejectedValueOnce(new ContributionError('network')).mockResolvedValueOnce(page('paused', 2, 1)).mockResolvedValue(page('active', 2, 2));
    const model = mount(api); await settle();
    expect(model.data.value?.items[0]?.applied_revision).toBe(1);
    await vi.advanceTimersByTimeAsync(pollDelays[0]);
    // A failed re-read keeps the shown page and tries again later.
    expect(api.list).toHaveBeenCalledTimes(2); expect(model.data.value?.items[0]?.revision).toBe(2); expect(model.loading.value).toBe(false);
    await vi.advanceTimersByTimeAsync(pollDelays[1]); await settle();
    expect(model.data.value?.items[0]?.state).toBe('paused');
    await vi.advanceTimersByTimeAsync(pollDelays[2]); await settle();
    expect(model.data.value?.items[0]).toMatchObject({ state: 'active', applied_revision: 2 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.list).toHaveBeenCalledTimes(4);
  });
  it('cancels an in-flight poll during confirmation and resumes after cancellation', async () => {
    vi.useFakeTimers();
    const api = fixture(), pending = page('pending');
    let finish: ((result: typeof pending) => void) | undefined;
    const late = new Promise<typeof pending>(resolve => { finish = resolve; });
    api.list.mockReset().mockResolvedValueOnce(pending).mockReturnValueOnce(late).mockResolvedValue(page('active'));
    const model = mount(api); await settle();
    await vi.advanceTimersByTimeAsync(3_000);
    const signal = api.list.mock.calls[1]?.[0];
    model.prepare({ kind: 'command', id: 'id', key: 'key', body: { action: 'pause', revision: 1 } });
    expect(signal.aborted).toBe(true);
    finish?.(page('active')); await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(model.data.value?.items[0]?.state).toBe('pending');
    expect(api.list).toHaveBeenCalledTimes(2);
    model.cancel(); await vi.advanceTimersByTimeAsync(3_000);
    expect(model.data.value?.items[0]?.state).toBe('active');
  });
  it('defers a hidden tab and discards a stale poll when changing pages', async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const api = fixture(), pending = page('pending');
      let finish: ((result: typeof pending) => void) | undefined;
      const late = new Promise<typeof pending>(resolve => { finish = resolve; });
      api.list.mockResolvedValueOnce(pending).mockReturnValueOnce(late).mockResolvedValueOnce(pending).mockResolvedValue(page('active'));
      const model = mount(api); await settle();
      await vi.advanceTimersByTimeAsync(3_000); expect(api.list).toHaveBeenCalledTimes(1);
      visibility.mockReturnValue('visible'); await vi.advanceTimersByTimeAsync(5_000);
      await model.next(); expect(api.list.mock.calls[1]?.[0].aborted).toBe(true);
      finish?.(page('exited')); await settle();
      expect(model.data.value?.items[0]?.state).toBe('pending');
      await vi.advanceTimersByTimeAsync(3_000);
      expect(api.list.mock.calls.slice(2).map(call => call[1])).toEqual([pending.next_cursor, pending.next_cursor]);
      expect(model.data.value?.items[0]?.state).toBe('active');
    } finally { visibility.mockRestore(); }
  });
  it('clears owner data when a poll is denied and stops polling', async () => {
    vi.useFakeTimers();
    const api = fixture();
    api.list.mockReset().mockResolvedValueOnce(page('pending')).mockRejectedValue(new ContributionError('forbidden'));
    const model = mount(api); await settle(); await vi.advanceTimersByTimeAsync(3_000);
    expect(model.data.value).toBeNull(); expect(model.options.value).toBeNull();
    expect(model.error.value).toBe('forbidden'); expect(model.statistics.value).not.toBeNull();
    await vi.advanceTimersByTimeAsync(60_000); expect(api.list).toHaveBeenCalledTimes(2);
  });
  it('does not poll settled or blocked contributions and stops on disposal', async () => {
    vi.useFakeTimers();
    const blocked = fixture(); blocked.list.mockResolvedValue(page('blocked'));
    mount(blocked); await settle(); await vi.advanceTimersByTimeAsync(60_000);
    expect(blocked.list).toHaveBeenCalledTimes(1);
    const changing = fixture(); changing.list.mockResolvedValue(page('pending'));
    mount(changing); await settle(); disposals.pop()?.();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(changing.list).toHaveBeenCalledTimes(1);
  });
});
