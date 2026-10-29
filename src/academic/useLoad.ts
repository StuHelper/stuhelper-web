import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { AcademicError } from './api'
export function useLoad<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const data = shallowRef<T>()
  const busy = ref(false)
  const error = ref('')
  let controller: AbortController | undefined
  async function load() {
    controller?.abort()
    const current = new AbortController(); controller = current
    busy.value = true; error.value = ''; data.value = undefined
    try { const result = await loader(current.signal); if (!current.signal.aborted) data.value = result }
    catch (failure) { if (!current.signal.aborted) error.value = failure instanceof AcademicError ? failure.code : 'unavailable' }
    finally { if (!current.signal.aborted) busy.value = false }
  }
  onBeforeUnmount(() => controller?.abort())
  return { data, busy, error, load }
}
