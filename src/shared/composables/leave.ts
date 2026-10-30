import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

/**
 * Ask before leaving a page with unsaved input or a write whose outcome is not
 * yet known. `message` returns the question, or '' when leaving is safe.
 */
export function useLeaveGuard(message: () => string) {
  const allow = () => {
    const question = message()
    return !question || window.confirm(question)
  }
  onBeforeRouteLeave(allow)
  onBeforeRouteUpdate((to, from) => (to.path === from.path ? true : allow()))
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (message()) event.preventDefault()
  }
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
}
