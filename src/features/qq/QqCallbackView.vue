<script setup lang="ts">
import { CircleCheck, CircleX } from 'lucide-vue-next'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useLeaveGuard } from '../../shared/composables/leave'
import { errorCode } from '../../shared/api/errors'
import PageHeader from '../../shared/ui/PageHeader.vue'
import { useQqBindingApi, type QqStatus } from './api'

// QQ Connect returns here with `state` and `code`, or with `state` and an error when the
// user declined. The page confirms or cancels once, then removes the parameters from the
// address so a reload or a shared link cannot reuse them.
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const api = useQqBindingApi()
const phase = ref<'working' | 'bound' | 'declined' | 'failed'>('working')
const failure = ref('')
const result = ref<QqStatus>()

// QQ sends exactly one state and either one code or one error. Anything else (missing,
// repeated or both) is an invalid callback and is never sent to the server.
const one = (value: unknown) => (typeof value === 'string' ? value : '')
const repeated = (value: unknown) => Array.isArray(value)
const query = route.query
const malformed = repeated(query.state) || repeated(query.code) || repeated(query.error) || !one(query.state) || (!one(query.code) === !one(query.error))

const lifetime = new AbortController()
onBeforeUnmount(() => lifetime.abort())
const key = crypto.randomUUID()
const state = one(query.state)
const code = one(query.code)
const providerError = one(query.error)
const retryable = ref(false)
useLeaveGuard(() => phase.value === 'working' || retryable.value ? t('common.leaveUncertain') : '')

// What QQ's own error means once the attempt has been closed on the server.
function qqOutcome(error: string): { phase: 'declined' | 'failed'; failure: string } {
  if (error === 'access_denied') return { phase: 'declined', failure: '' }
  if (error === '100010' || error === 'redirect_uri_mismatch') return { phase: 'failed', failure: 'redirect_uri_mismatch' }
  if (error === '100048') return { phase: 'failed', failure: 'unionid_permission_required' }
  return { phase: 'failed', failure: 'reauthorization_required' }
}
async function confirm() {
  retryable.value = false
  phase.value = 'working'
  if (malformed) {
    phase.value = 'failed'
    failure.value = 'invalid_state'
    return
  }
  try {
    if (code) {
      result.value = await api.confirmConnect({ state, code }, key, undefined, lifetime.signal)
      phase.value = 'bound'
    } else {
      // Declining or failing at QQ still ends this attempt so the state cannot be used later.
      result.value = await api.cancelConnect({ state }, key, lifetime.signal)
      const outcome = qqOutcome(providerError)
      phase.value = outcome.phase
      failure.value = outcome.failure
    }
  } catch (error) {
    phase.value = 'failed'
    retryable.value = !lifetime.signal.aborted && ['network', 'timeout', 'processing', 'unavailable'].includes(errorCode(error))
    failure.value = errorCode(error).replace(/^qq_binding_/, '')
  }
}
onMounted(() => {
  // The code and state leave the address at once, so reloading or sharing cannot reuse them.
  void router.replace({ path: route.path, query: {} })
  void confirm()
})

const known = ['invalid_state', 'invalid_input', 'reauthorization_required', 'processing', 'unionid_missing', 'unionid_permission_required', 'redirect_uri_mismatch', 'already_bound', 'ownership_conflict', 'casdoor_conflict', 'revision_conflict', 'rate_limited', 'account_closed', 'forbidden', 'unauthenticated', 'connect_disabled', 'connect_unconfigured', 'unavailable']
// Bound here, but the QQ sign-in is not linked to the same QQ yet: the account page explains.
const loginPending = computed(() => phase.value === 'bound' && result.value?.connect_login !== undefined && result.value.connect_login !== 'linked')
</script>

<template>
  <div class="stack-lg narrow">
    <PageHeader
      :title="t('qq.callback.title')"
      back="/me/account"
      :back-label="t('qq.callback.back')"
    />
    <div
      class="card stack center"
      role="status"
      aria-live="polite"
    >
      <template v-if="phase === 'working'">
        <p class="muted">
          {{ t('qq.callback.working') }}
        </p>
      </template>
      <template v-else-if="phase === 'bound'">
        <CircleCheck
          class="icon success"
          aria-hidden="true"
        />
        <p>{{ t('qq.callback.bound') }}</p>
        <p class="muted small">
          {{ result?.complete ? t('qq.complete') : t('qq.requirement') }}
        </p>
        <p
          v-if="loginPending"
          class="muted small"
        >
          {{ t('qq.callback.loginPending') }}
        </p>
      </template>
      <template v-else-if="phase === 'declined'">
        <CircleX
          class="icon"
          aria-hidden="true"
        />
        <p>{{ t('qq.callback.declined') }}</p>
      </template>
      <template v-else>
        <CircleX
          class="icon danger"
          aria-hidden="true"
        />
        <p>{{ t(known.includes(failure) ? `qq.errors.${failure}` : 'qq.errors.unavailable') }}</p>
      </template>
      <button
        v-if="retryable"
        class="btn"
        type="button"
        @click="confirm"
      >
        {{ t('common.retryOriginal') }}
      </button>
      <RouterLink
        v-if="phase !== 'working'"
        class="btn btn-primary"
        to="/me/account"
      >
        {{ t('qq.callback.back') }}
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.narrow { max-width: 36rem; }
.center { justify-items: center; text-align: center; }
.icon { width: 2.5rem; height: 2.5rem; color: var(--label-3); }
.success { color: var(--success); }
.danger { color: var(--danger); }
</style>
