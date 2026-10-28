import { onMounted, onScopeDispose, readonly, shallowRef } from 'vue';
import { useHostFetch } from '../api/host';
import { custodyAPI, CustodyError, parseCustodyBinding, type CustodyBinding, type CustodyPage, type CustodyPolicy, type CustodyRequest } from '../api/custody';

export function useCustody(admin = false, api = custodyAPI(useHostFetch())) {
  const data = shallowRef<CustodyPage | null>(null), policy = shallowRef<CustodyPolicy | null>(null);
  const loading = shallowRef(false), sending = shallowRef(false), error = shallowRef<CustodyError['code'] | null>(null);
  const recovery = shallowRef<{ key: string; item?: CustodyBinding } | null>(null);
  let read: AbortController | undefined, write: AbortController | undefined, disposed = false, cursor = '';
  function failed(e: unknown) {
    error.value = e instanceof CustodyError ? e.code : 'network';
    if (error.value === 'forbidden' || error.value === 'unauthenticated') { data.value = null; recovery.value = null; }
  }
  async function reload(after = cursor) {
    if (disposed || sending.value) return;
    read?.abort(); const controller = new AbortController(); read = controller;
    const timer = setTimeout(() => controller.abort(), 10_000), fresh = () => !disposed && read === controller;
    loading.value = true; error.value = null; data.value = null; policy.value = null;
    const results = await Promise.allSettled([api.list(controller.signal, after, admin), admin ? Promise.resolve(null) : api.policy(controller.signal)]);
    clearTimeout(timer);
    if (!fresh()) return;
    if (controller.signal.aborted) failed(new CustodyError('network'));
    else {
      if (results[0].status === 'fulfilled') { data.value = results[0].value; cursor = after; } else failed(results[0].reason);
      if (results[1].status === 'fulfilled') policy.value = results[1].value; else if (!error.value) failed(results[1].reason);
    }
    loading.value = false;
  }
  async function mutation(run: (signal: AbortSignal) => Promise<CustodyBinding>, pending: { key: string; item?: CustodyBinding }) {
    if (sending.value || disposed || !data.value) return;
    read?.abort(); const controller = new AbortController(); write = controller;
    const timer = setTimeout(() => controller.abort(), 70_000);
    sending.value = true; error.value = null; recovery.value = pending;
    try {
      await run(controller.signal);
      if (!disposed && write === controller) recovery.value = null;
    } catch (e) {
      if (!disposed && write === controller) { failed(e); if (e instanceof CustodyError && !e.uncertain) recovery.value = null; }
    } finally {
      clearTimeout(timer);
      if (!disposed && write === controller) { sending.value = false; if (!error.value) await reload(); }
    }
  }
  async function submit(body: CustodyRequest, item?: CustodyBinding) {
    if (admin || recovery.value || loading.value || !policy.value) return;
    const key = crypto.randomUUID();
    // The callback is discarded when the request settles. Recovery retains only
    // identifiers, never a credential-bearing request snapshot.
    await mutation(signal => api.submit(key, body, signal, item?.id), { key });
  }
  async function resume(item: CustodyBinding) {
    if (recovery.value || loading.value) return;
    const snapshot = parseCustodyBinding(item);
    await mutation(signal => api.resume(snapshot, signal, admin), { key: snapshot.request_id, item: snapshot });
  }
  async function recover() {
    const pending = recovery.value; if (!pending || sending.value || disposed) return;
    if (pending.item) { await mutation(signal => api.resume(pending.item!, signal, admin), pending); return; }
    const controller = new AbortController(); read = controller; loading.value = true; error.value = null;
    const timer = setTimeout(() => controller.abort(), 10_000);
    try { await api.requestStatus(pending.key, controller.signal); if (!disposed && read === controller) recovery.value = null; }
    catch (e) { if (!disposed && read === controller) failed(e); }
    finally { clearTimeout(timer); if (!disposed && read === controller) { loading.value = false; if (!error.value) await reload(); } }
  }
  onMounted(() => reload());
  onScopeDispose(() => { disposed = true; read?.abort(); write?.abort(); data.value = null; recovery.value = null; });
  return { data: readonly(data), policy: readonly(policy), loading: readonly(loading), sending: readonly(sending), error: readonly(error), recovery: readonly(recovery), reload, submit, resume, recover };
}
