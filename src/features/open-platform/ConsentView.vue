<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useMutation } from '../../shared/composables/async'
import { useErrorText } from '../../shared/ui/messages'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import { readAuthorization, scopes, usePlatformApi, type Consent, type Scope } from './api'

// OAuth authorization page. The server binds the request to the signed-in person,
// the application revision, the exact redirect address, the state and the PKCE
// challenge; this page shows who is asking for what and records an explicit
// per-scope decision. Nothing is preselected.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const route = useRoute()
const api = usePlatformApi()
const request = readAuthorization(route.query)

const starting = useMutation()
const consent = shallowRef<Consent>()
async function start() {
  if (!request) return
  const result = await starting.run('consent:start', request, (body, key) => api.startConsent(body, key))
  if (result) consent.value = result
}
async function retryStart() {
  const result = await starting.retry()
  // The retried request is the original authorization request and returns the same Consent.
  if (result) consent.value = result as Consent
}
onMounted(() => void start())

const requested = computed(() => scopes.filter((scope) => consent.value?.requested_scopes.includes(scope)))
const chosen = ref<Scope[]>([])
const host = computed(() => {
  try {
    return new URL(consent.value?.redirect_uri ?? '').host
  } catch {
    return ''
  }
})
const deciding = useMutation()
const leaving = ref(false)
async function decide(decision: 'approve' | 'deny') {
  const current = consent.value
  if (!current || (decision === 'approve' && !chosen.value.length)) return
  const body = { decision, scopes: decision === 'approve' ? scopes.filter((scope) => chosen.value.includes(scope)) : [] }
  const result = await deciding.run(`consent:${current.id}`, body, (value, key) => api.decide(current.id, value, key))
  if (result) leave(result.redirect_uri)
}
async function retryDecision() {
  const result = await deciding.retry()
  if (result) leave((result as { redirect_uri: string }).redirect_uri)
}
// The server returns the application's registered address with the code or the denial.
function leave(target: string) {
  leaving.value = true
  window.location.assign(target)
}
const locked = computed(() => deciding.busy.value || deciding.uncertain.value || leaving.value)
</script>

<template>
  <div class="consent">
    <section
      v-if="!request"
      class="card stack"
      role="alert"
    >
      <h1>{{ t('platform.consent.invalidTitle') }}</h1>
      <p class="muted">
        {{ t('platform.consent.invalid') }}
      </p>
    </section>
    <section
      v-else-if="!consent"
      class="card stack"
    >
      <h1>{{ t('platform.consent.title') }}</h1>
      <p
        v-if="starting.busy.value"
        class="muted"
        role="status"
      >
        {{ t('platform.consent.loading') }}
      </p>
      <p
        v-else-if="starting.error.value && !starting.uncertain.value"
        class="notice notice-warning"
        role="alert"
      >
        {{ errorText(starting.error.value) }}
      </p>
      <MutationNotice
        v-if="starting.uncertain.value"
        :busy="starting.busy.value"
        :error="starting.error.value"
        :uncertain="starting.uncertain.value"
        @retry="retryStart"
      />
    </section>
    <form
      v-else
      class="card stack-lg"
      novalidate
      @submit.prevent="decide('approve')"
    >
      <header class="stack-sm">
        <span
          class="badge"
          aria-hidden="true"
        ><ShieldCheck /></span>
        <h1>{{ t('platform.consent.heading', { name: consent.application.name }) }}</h1>
        <p class="muted">
          {{ consent.application.purpose }}
        </p>
        <p class="subtle small">
          {{ t('platform.consent.client', { id: consent.application.id, host }) }}
        </p>
      </header>
      <fieldset
        class="stack-sm"
        :disabled="locked"
      >
        <legend class="field-label">
          {{ t('platform.consent.choose') }}
        </legend>
        <label
          v-for="scope in requested"
          :key="scope"
          class="check"
        >
          <input
            v-model="chosen"
            type="checkbox"
            :value="scope"
          >
          <span class="stack-xs">
            <span>{{ t(`platform.scopes.${scope}.title`) }}</span>
            <span class="subtle">{{ t(`platform.scopes.${scope}.detail`) }}</span>
          </span>
        </label>
      </fieldset>
      <ul class="stack-sm small muted terms">
        <li>{{ t('platform.consent.limits') }}</li>
        <li>{{ t('platform.consent.withdraw') }}</li>
        <li>{{ t('platform.consent.expires', { time: format.dateTime(consent.expires_at) }) }}</li>
      </ul>
      <MutationNotice
        :busy="deciding.busy.value"
        :error="deciding.error.value"
        :uncertain="deciding.uncertain.value"
        @retry="retryDecision"
      />
      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="!chosen.length || locked"
        >
          {{ t('platform.consent.approve', { count: format.number(chosen.length) }) }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="locked"
          @click="decide('deny')"
        >
          {{ t('platform.consent.deny') }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.consent { max-width: 34rem; margin: clamp(1rem, 6vh, 4rem) auto; }
.consent h1 { font-size: clamp(1.25rem, 1.1rem + .8vw, 1.625rem); line-height: 1.3; }
.badge { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 14px; background: var(--c-green); color: #fff; }
.badge svg { width: 26px; height: 26px; }
.check { display: flex; align-items: flex-start; gap: .5rem; }
.check input { margin-block-start: .25rem; }
.stack-xs { display: grid; gap: .125rem; }
.terms { padding-inline-start: 1.25rem; list-style: disc; }
</style>
