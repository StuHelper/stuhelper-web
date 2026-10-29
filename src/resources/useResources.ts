import { onUnmounted, ref } from 'vue';
import { onBeforeRouteUpdate, onBeforeRouteLeave } from 'vue-router';
import { useHostFetch } from '../api/host';
import { Client, errorCode, Mutation } from './api';
export function useResources(clear: () => void = () => {}, unsaved: () => boolean = () => false, confirmDiscard: () => boolean = () => false) {
  const busy = ref(false),
    error = ref(''),
    uncertain = ref(false);
  let alive = true;
  const lifetime = new AbortController();
  let last: undefined | (() => Promise<unknown>);
  const client = new Client(useHostFetch(), clear);
  const mutation = new Mutation(client);
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return;
    last = action;
    busy.value = true;
    error.value = '';
    try {
      return await action();
    } catch (e) {
      if (alive) error.value = errorCode(e);
    } finally {
      busy.value = false;
      uncertain.value = mutation.uncertain;
    }
  }
  const canNavigate = () => !busy.value && !uncertain.value && (!unsaved() || confirmDiscard());
  onBeforeRouteUpdate(canNavigate);
  onBeforeRouteLeave(canNavigate);
  const beforeUnload = (event: BeforeUnloadEvent) => { if (busy.value || uncertain.value || unsaved()) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  onUnmounted(() => {
    window.removeEventListener('beforeunload', beforeUnload);
    alive = false;
    lifetime.abort();
  });
  return {
    client,
    mutation,
    busy,
    error,
    uncertain,
    run,
    retry: () => (last ? run(last) : Promise.resolve()),
    signal: lifetime.signal,
  };
}
