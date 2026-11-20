import { onBeforeUnmount, onMounted, ref, watch, type WatchStopHandle } from 'vue'

/**
 * Current time, refreshed on an interval, for countdowns. With `when`, the clock only runs
 * while it returns true, so a page without a countdown on screen keeps no timer.
 */
export function useNow(interval = 30_000, when?: () => boolean) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  let watching: WatchStopHandle | undefined
  const start = () => {
    if (timer) return
    now.value = Date.now()
    timer = setInterval(() => { now.value = Date.now() }, interval)
  }
  const stop = () => { clearInterval(timer); timer = undefined }
  // `when` may read state declared after this call, so it is first read once mounted.
  onMounted(() => {
    if (!when) start()
    else watching = watch(when, (on) => (on ? start() : stop()), { immediate: true })
  })
  onBeforeUnmount(() => { watching?.(); stop() })
  return now
}
