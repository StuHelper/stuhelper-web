import { watch, type Ref } from 'vue';

export const pollDelays = [3_000, 5_000, 10_000, 20_000, 30_000] as const;

/** Read the visible page in place while the server is applying a change. */
export function useChangePolling<T>(
  page: Ref<T | null>,
  changing: (page: T) => boolean,
  busy: () => boolean,
  readPage: (signal: AbortSignal) => Promise<T>,
  onError: (error: unknown) => void,
) {
  watch(() => page.value !== null && !busy() && changing(page.value), (enabled, _, onCleanup) => {
    if (!enabled) return;
    let delayIndex = 0;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    let stopped = false;

    function schedule() {
      if (stopped) return;
      timer = setTimeout(() => void poll(), pollDelays[delayIndex]);
      delayIndex = Math.min(delayIndex + 1, pollDelays.length - 1);
    }
    async function poll() {
      if (document.visibilityState === 'hidden') {
        schedule();
        return;
      }
      const controller = new AbortController();
      request = controller;
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const result = await readPage(controller.signal);
        if (!controller.signal.aborted) page.value = result;
      } catch (error) {
        if (!controller.signal.aborted) onError(error);
      } finally {
        clearTimeout(timeout);
        request = undefined;
        schedule();
      }
    }
    // Cancel synchronously when a foreground operation starts, including requests
    // whose transport still resolves after abort. Each polling run owns its timers.
    onCleanup(() => {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
    });
    schedule();
  }, { flush: 'sync' });
}
