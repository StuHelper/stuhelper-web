import { onScopeDispose, watch, type Ref } from 'vue';

// Delays between quiet re-reads while something is changing; the last one repeats.
export const pollDelays = [3_000, 5_000, 10_000, 20_000, 30_000] as const;

/**
 * Re-reads a page while the server is still applying an accepted change, so the page updates
 * without a manual refresh. Every full reload passes through an empty page, which restarts the
 * quick delays. `refresh` replaces the page on success. It returns true only when the re-read
 * failed and the shown page stays, so the poll is tried again; a superseded re-read returns false.
 */
export function useChangePolling<T>(page: Readonly<Ref<T | null>>, changing: (page: T) => boolean, busy: () => boolean, refresh: () => Promise<boolean>) {
  let timer: ReturnType<typeof setTimeout> | undefined, polls = 0, stopped = false;
  function schedule() {
    if (stopped || timer) return;
    timer = setTimeout(() => void poll(), pollDelays[Math.min(polls++, pollDelays.length - 1)]);
  }
  async function poll() {
    timer = undefined;
    if (stopped || page.value === null) return;
    // A hidden tab or an operation in progress waits for the next turn.
    if (busy() || document.visibilityState === 'hidden') { schedule(); return; }
    // A new page schedules the next poll through the watcher below.
    if (await refresh() && page.value !== null && changing(page.value)) schedule();
  }
  watch(page, (value) => {
    clearTimeout(timer); timer = undefined;
    if (value !== null && changing(value)) schedule(); else polls = 0;
  });
  onScopeDispose(() => { stopped = true; clearTimeout(timer); });
}
