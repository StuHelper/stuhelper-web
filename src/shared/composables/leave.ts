import { askConfirm } from '../ui/confirm'
import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

const guards = new Set<() => string>()

/** Whether a mounted page holds unsaved input or a write whose outcome is unknown. */
export const hasLeaveWarning = () => [...guards].some((message) => !!message())

/**
 * Ask before leaving a page with unsaved input or a write whose outcome is not
 * yet known. `message` returns the question, or '' when leaving is safe.
 * `query` names parameters whose change replaces the guarded content on the same path.
 */
export function useLeaveGuard(message: () => string, options: { query?: readonly string[] } = {}) {
  const allow = () => {
    const question = message()
    return !question || askConfirm(question)
  }
  onBeforeRouteLeave(allow)
  onBeforeRouteUpdate((to, from) => (to.path === from.path && !options.query?.some((key) => to.query[key] !== from.query[key]) ? true : allow()))
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (message()) event.preventDefault()
  }
  onMounted(() => {
    guards.add(message)
    window.addEventListener('beforeunload', beforeUnload)
  })
  onBeforeUnmount(() => {
    guards.delete(message)
    window.removeEventListener('beforeunload', beforeUnload)
  })
}
