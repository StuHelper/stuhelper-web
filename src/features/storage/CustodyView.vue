<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { CustodyBinding } from '../../api/custody'
import { useFormat } from '../../app/i18n'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import MeLayout from '../account/MeLayout.vue'
import { useCustody } from './useCustody'

// Connect a BHpan account for storage contribution. Passwords go only to this
// submission: they are cleared right after sending and never kept for retries.
const { t, te } = useI18n()
const format = useFormat()
const { data, policy, loading, sending, error, recovery, reload, submit, resume, recover } = useCustody(false)
const mode = ref<'local' | 'sso'>('local')
const username = ref('')
const password = ref('')
const until = ref('')
const accepted = ref(false)
const editing = ref<CustodyBinding | null>(null)
const invalid = ref(false)
const title = ref<HTMLElement>()
const locked = computed(() => loading.value || sending.value || !!recovery.value)
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const label = (prefix: string, value: string) => (te(`${prefix}.${value}`) ? t(`${prefix}.${value}`) : t('contribution.unknown'))

function clearSecrets() {
  password.value = ''
  username.value = ''
}
function reset() {
  clearSecrets()
  editing.value = null
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
  const task = submit({ adapter: 'bhpan', credential: { mode: mode.value, username: username.value, password: password.value }, until: new Date(expires).toISOString(), consent: { accepted: true, version: current.version, digest: current.digest }, ...(editing.value ? { revision: editing.value.revision } : {}) }, editing.value ?? undefined)
  clearSecrets()
  accepted.value = false
  await task
  if (!error.value) reset()
}
watch(error, (value) => {
  if (value === 'forbidden' || value === 'unauthenticated') reset()
})
</script>

<template>
  <MeLayout
    :title="t('custody.title')"
    :description="t('custody.description')"
  >
    <template #actions>
      <button
        class="btn"
        type="button"
        :disabled="loading || sending"
        @click="reload('')"
      >
        {{ t('common.refresh') }}
      </button>
      <RouterLink
        class="btn"
        to="/contributions"
      >
        {{ t('nav.contributions') }}
      </RouterLink>
    </template>

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
            @click="recover"
          >
            {{ t('custody.recover') }}
          </button>
        </div>
      </div>

      <form
        v-if="data && policy"
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
        <p
          v-if="editing"
          class="mono subtle"
        >
          <bdi>{{ editing.id }}</bdi>
        </p>
        <fieldset
          class="stack"
          :disabled="locked"
        >
          <legend class="visually-hidden">
            {{ t('custody.credentials') }}
          </legend>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">{{ t('custody.mode') }}</span>
              <select
                v-model="mode"
                class="select"
              >
                <option value="local">{{ t('custody.local') }}</option>
                <option value="sso">{{ t('custody.sso') }}</option>
              </select>
            </label>
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
              <input
                v-model="until"
                class="input"
                required
                type="datetime-local"
              >
            </label>
          </div>
          <p class="small muted">
            {{ t('custody.ssoNotice') }}
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
              v-if="editing"
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
        <h2>{{ t('custody.accounts') }}</h2>
        <p
          v-if="!data.items.length"
          class="empty"
        >
          {{ t('custody.empty') }}
        </p>
        <ul class="grid-wide list">
          <li
            v-for="item in data.items"
            :key="item.id"
          >
            <article class="card stack-sm">
              <div class="row-between">
                <h3><bdi>{{ item.adapter }}</bdi></h3>
                <StatusTag :tone="item.state === 'ready' ? 'success' : item.state === 'pending' ? 'warning' : 'danger'">
                  {{ label('custody.states', item.state) }}
                </StatusTag>
              </div>
              <p class="mono subtle">
                <bdi>{{ item.id }}</bdi>
              </p>
              <p class="small">
                {{ t('custody.requestUntil', { time: format.dateTime(item.authorization_expires_at) }) }}
              </p>
              <p
                v-if="item.last_error"
                class="notice notice-warning small"
              >
                {{ label('custody.reasons', item.last_error) }}
              </p>
              <div class="row">
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
                  @click="resume(item)"
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
          @click="reload(data.next_cursor)"
        >
          {{ t('common.next') }}
        </button>
      </section>
    </div>
  </MeLayout>
</template>
