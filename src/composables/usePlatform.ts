import { onMounted, onScopeDispose, readonly, shallowRef } from 'vue'
import { getCapabilities, getModules, PlatformError } from '../api/client'
import type { Capabilities, ModuleStatus } from '../api/client'

export function usePlatform(options: { admin?: boolean } = {}) {
  const state = shallowRef<'loading' | 'ready' | 'error'>('loading')
  const capabilities = shallowRef<Capabilities | null>(null)
  const modules = shallowRef<ModuleStatus[]>([])
  const error = shallowRef<PlatformError['code'] | null>(null)
  let current: AbortController | undefined

  async function reload() {
    current?.abort()
    const controller = new AbortController()
    current = controller
    const timeout = setTimeout(() => controller.abort(), 5000)
    state.value = 'loading'
    error.value = null
    capabilities.value = null
    modules.value = []
    try {
      const available = await getCapabilities(controller.signal)
      const inventory = options.admin ? await getModules(controller.signal) : []
      if (current !== controller) return
      capabilities.value = available
      modules.value = inventory
      state.value = 'ready'
    } catch (cause) {
      if (current !== controller) return
      error.value = cause instanceof PlatformError ? cause.code : 'network'
      state.value = 'error'
    } finally { clearTimeout(timeout) }
  }

  onMounted(reload)
  onScopeDispose(() => { const controller = current; current = undefined; controller?.abort() })
  return { state: readonly(state), error: readonly(error), capabilities: readonly(capabilities), modules: readonly(modules), reload }
}
