import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Current time, refreshed on an interval, for countdowns. */
export function useNow(interval = 30_000) {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, interval) })
  onBeforeUnmount(() => clearInterval(timer))
  return now
}
