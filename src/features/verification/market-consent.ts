import { ref, watch, type Ref } from 'vue'
import { useAsync } from '../../shared/composables/async'
import { errorCode } from '../../shared/api/errors'
import { useVerification, type Schemas } from './api'

export function useMarketConsent(locale: Ref<string>, visible: Ref<boolean>) {
  const api = useVerification()
  const accepted = ref(false)
  const withdrawing = ref(false)
  const withdrawalError = ref('')
  const notice = useAsync((signal) => api.get('MarketConsentNotice', `/api/v1/verification/identity/market-consent?locale=${encodeURIComponent(locale.value)}`, signal))
  watch([locale, visible], () => {
    accepted.value = false
    withdrawalError.value = ''
    if (visible.value) void notice.reload()
    else notice.clear()
  }, { immediate: true, flush: 'sync' })

  function choice(): Schemas['MarketConsentInput'] | undefined {
    const n = notice.data.value
    if (!accepted.value || !n?.available || n.locale !== locale.value) return undefined
    return { accepted: true, locale: n.locale, version: n.version, digest: n.digest, revision: n.state.revision }
  }
  async function refresh() {
    accepted.value = false
    await notice.reload()
  }
  async function withdraw() {
    if (withdrawing.value) return
    withdrawing.value = true
    withdrawalError.value = ''
    accepted.value = false
    try {
      await api.write('MarketConsentState', '/api/v1/verification/identity/market-consent', undefined, 'DELETE')
      await refresh()
    } catch (error) {
      withdrawalError.value = errorCode(error)
    } finally {
      withdrawing.value = false
    }
  }
  return { accepted, withdrawing, withdrawalError, notice, choice, refresh, withdraw }
}
