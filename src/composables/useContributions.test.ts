// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import example from '../../contracts/contribution.example.json';
import { ContributionError, parsePage, parsePolicy, parseStatistics } from '../api/contribution';
import { useContributions } from './useContributions';

const disposals: (() => void)[] = [];
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); });
async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); await nextTick(); }
function fixture() {
  return { list: vi.fn().mockResolvedValue(parsePage(example.page)), options: vi.fn().mockResolvedValue(example.options), policy: vi.fn().mockResolvedValue(parsePolicy(example.policy)), statistics: vi.fn().mockResolvedValue(parseStatistics(example.statistics)), get: vi.fn(), execute: vi.fn() };
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
