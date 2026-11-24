<script setup lang="ts">
import TrustConsentPanel from './TrustConsentPanel.vue'
import AppDateTime from '../../shared/ui/AppDateTime.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CustodyBinding } from '../../api/custody'
import { useLeaveGuard } from '../../shared/composables/leave'
import { useFormat } from '../../app/i18n'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useCustody } from './useCustody'

// Connect a BHpan account for storage contribution. Passwords go only to this
// submission: they are cleared right after sending and never kept for retries.
const emit = defineEmits<{ updated: [] }>()
const { t, te } = useI18n()
const format = useFormat()
const { data, policy, loading, sending, error, recovery, reload, submit, resume, recover, withdraw } = useCustody(false)
const paged = ref(false)
const username = ref('')
const password = ref('')
const until = ref('')
const accepted = ref(false)
const editing = ref<CustodyBinding | null>(null)
const adding = ref(false)
// The form stays out of the way once an account exists.
const showForm = computed(() => !!editing.value || adding.value || !data.value?.items.length)
const invalid = ref(false)
const title = ref<HTMLElement>()
const locked = computed(() => loading.value || sending.value || !!recovery.value)
useLeaveGuard(() => recovery.value ? t('common.leaveUncertain') : sending.value ? t('common.leaveUnsaved') : '')
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const label = (prefix: string, value: string) => (te(`${prefix}.${value}`) ? t(`${prefix}.${value}`) : t('contribution.unknown'))

function clearSecrets() {
  password.value = ''
  username.value = ''
}
function reset() {
  clearSecrets()
  editing.value = null
  adding.value = false
  accepted.value = false
  invalid.value = false
  until.value = ''
}
function edit(item: CustodyBinding) {
  reset()
  editing.value = item
  void nextTick(() => title.value?.focus())
}
async function send() {
  const current = policy.value
  const expires = new Date(until.value).getTime()
  if (!current || !accepted.value || !username.value || !password.value || !Number.isFinite(expires) || expires <= Date.now() + 60_000 || expires > Date.now() + current.max_term_seconds * 1000) {
    invalid.value = true
    return
  }
  invalid.value = false
  const task = submit({ adapter: 'bhpan', credential: { username: username.value, password: password.value }, until: new Date(expires).toISOString(), consent: { accepted: true, version: current.version, digest: current.digest }, ...(editing.value ? { revision: editing.value.revision } : {}) }, editing.value ?? undefined)
  clearSecrets()
  accepted.value = false
  await task
  if (!error.value) {
    reset()
    emit('updated')
  }
}
async function resumeAccount(item: CustodyBinding) {
  await resume(item)
  if (!error.value) emit('updated')
}
async function recoverAccount() {
  await recover()
  if (!error.value) emit('updated')
}
function goNext() {
  if (!data.value?.next_cursor) return
  paged.value = true
  void reload(data.value.next_cursor)
}
function goFirst() {
  paged.value = false
  void reload('')
}
const adapterName = (id: string) => (id === 'bhpan' ? 'BHpan' : id)
// Each account must stay distinguishable: the masked login, with the record's identifier tail
// when it is missing or two accounts share the same mask.
const accountTitle = (item: { adapter: string; account_hint?: string; id: string }) => {
  const shared = item.account_hint ? (data.value?.items.filter((other) => other.account_hint === item.account_hint).length ?? 0) > 1 : false
  const tag = item.account_hint ? (shared ? `${item.account_hint} #${item.id.slice(-4)}` : item.account_hint) : item.id.slice(-8)
  return `${adapterName(item.adapter)} · ${tag}`
}
// Opened from the contributions tab when no account is left to contribute: show the connect
// form straight away and move focus to it once the account list has loaded.
const focusForm = ref(false)
function connect() {
  reset()
  adding.value = true
  focusForm.value = true
}
watch([focusForm, title], ([requested, element]) => {
  if (requested && element) {
    focusForm.value = false
    element.focus()
  }
}, { flush: 'post' })
defineExpose({ clearSecrets, connect, refresh: () => { paged.value = false; return reload('') } })
watch(error, (value) => {
  if (value === 'forbidden' || value === 'unauthenticated') reset()
})
</script>

<template>
  <div class="stack-lg">
    <div
      class="stack"
      aria-live="polite"
    >
      <p
        v-if="loading || sending"
        class="subtle"
      >
        {{ t(sending ? 'custody.sending' : 'common.loading') }}
      </p>
      <ErrorNotice
        v-if="error"
        :code="error"
        :retryable="!recovery"
        @retry="reload('')"
      />
      <div
        v-if="recovery"
        class="notice notice-warning"
        role="alert"
      >
        <span>{{ t('custody.uncertain') }}</span>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="loading || sending"
          @click="recoverAccount"
        >
          {{ t('custody.recover') }}
        </button>
      </div>
    </div>

    <form
      v-if="data && policy && showForm"
      class="card stack"
      autocomplete="off"
      @submit.prevent="send"
    >
      <h2
        ref="title"
        tabindex="-1"
      >
        {{ t(editing ? 'custody.reauthorize' : 'custody.connect') }}
      </h2>
      <fieldset
        class="stack"
        :disabled="locked"
      >
        <legend class="visually-hidden">
          {{ t('custody.credentials') }}
        </legend>
        <div class="form-grid">
          <label class="field">
            <span class="field-label">{{ t('custody.username') }}</span>
            <input
              v-model="username"
              class="input"
              required
              maxlength="128"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
            >
          </label>
          <label class="field">
            <span class="field-label">{{ t('custody.password') }}</span>
            <input
              v-model="password"
              class="input"
              required
              type="password"
              maxlength="1024"
              autocomplete="new-password"
            >
          </label>
          <label class="field">
            <span class="field-label">{{ t('custody.until', { zone }) }}</span>
            <AppDateTime
              v-model="until"
              :aria-label="t('custody.until', { zone })"
              required
            />
            <span class="field-hint">{{ t('custody.maxTermHint', { days: format.number(Math.max(1, Math.round(policy.max_term_seconds / 86400))) }) }}</span>
          </label>
        </div>
        <p class="small muted">
          {{ t('custody.loginNotice') }}
        </p>
        <a
          :href="policy.url"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('custody.terms', { version: policy.version }) }}</a>
        <label class="check">
          <input
            v-model="accepted"
            type="checkbox"
            required
          >
          <span>{{ t('custody.consent') }}</span>
        </label>
        <p
          v-if="invalid"
          class="notice notice-error"
          role="alert"
        >
          {{ t('custody.invalid') }}
        </p>
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="submit"
          >
            {{ t('custody.submit') }}
          </button>
          <button
            v-if="editing || adding"
            class="btn"
            type="button"
            @click="reset"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </fieldset>
    </form>

    <section
      v-if="data"
      class="section"
    >
      <div class="section-head">
        <h2>{{ t('custody.accounts') }}</h2>
        <div class="row">
          <button
            v-if="paged"
            class="btn btn-sm"
            type="button"
            :disabled="locked"
            @click="goFirst"
          >
            {{ t('contribution.first') }}
          </button>
          <button
            v-if="data.items.length && !showForm"
            class="btn btn-sm"
            type="button"
            :disabled="locked"
            @click="adding = true"
          >
            {{ t('custody.connect') }}
          </button>
        </div>
      </div>
      <ul class="grid-wide list">
        <li
          v-for="item in data.items"
          :key="item.id"
        >
          <article class="card stack-sm">
            <div class="row-between">
              <h3><bdi>{{ accountTitle(item) }}</bdi></h3>
              <StatusTag :tone="item.state === 'ready' ? 'success' : item.state === 'pending' ? 'warning' : 'danger'">
                {{ label('custody.states', item.state) }}
              </StatusTag>
            </div>
            <p class="small">
              {{ t('custody.requestUntil', { time: format.dateTime(item.authorization_expires_at) }) }}
            </p>
            <p
              v-if="item.last_error"
              class="notice notice-warning small"
            >
              {{ label('custody.reasons', item.last_error) }}
            </p>
            <TrustConsentPanel
              v-if="item.state === 'ready'"
              :id="item.id"
            />
            <div class="row">
              <button
                v-if="item.can_withdraw"
                class="btn btn-sm"
                type="button"
                :disabled="locked"
                @click="withdraw(item)"
              >
                {{ t('custody.withdrawApplication') }}
              </button>
              <button
                v-if="item.state === 'ready' || item.state === 'credentials_required'"
                class="btn btn-sm"
                type="button"
                :disabled="locked"
                @click="edit(item)"
              >
                {{ t('custody.reauthorize') }}
              </button>
              <button
                v-if="item.state === 'pending' || item.state === 'blocked'"
                class="btn btn-sm"
                type="button"
                :disabled="locked"
                @click="resumeAccount(item)"
              >
                {{ t('custody.resume') }}
              </button>
            </div>
          </article>
        </li>
      </ul>
      <button
        v-if="data.next_cursor"
        class="btn"
        type="button"
        :disabled="locked"
        @click="goNext"
      >
        {{ t('common.next') }}
      </button>
    </section>
  </div>
</template>
