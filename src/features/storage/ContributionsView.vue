<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { Command, Contribution } from '../../api/contribution'
import { useFormat } from '../../app/i18n'
import { useSession } from '../../shared/session'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useErrorText } from '../../shared/ui/messages'
import { conditions, gbInput, localDateInput } from './conditions'
import { useContributions } from './useContributions'

// Public transparency figures and the user's own storage contributions.
// Declared capacity and actually writable capacity are always shown apart.
const { t, te } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const session = useSession()
const { data, options, policy, statistics, loading, sending, error, publicError, pending, uncertain, completed, reload, prepare, cancel, submit, next, nextOptions, first } = useContributions()
const bytes = (value: number) => format.value.bytes(value)
const label = (prefix: string, value: string) => (te(`${prefix}.${value}`) ? t(`${prefix}.${value}`) : t('contribution.unknown'))
const desired: Record<Contribution['desired_state'], string> = { active: 'resume', paused: 'pause', exiting: 'exit', revoked: 'revoke' }
const locked = computed(() => loading.value || sending.value || !!pending.value)
const instance = ref('')
const limit = ref('')
const reserve = ref('0')
const until = ref('')
const accepted = ref(false)
const editing = ref<{ item: Contribution; mode: 'configure' | 'renew' } | null>(null)
const invalid = ref(false)
const formTitle = ref<HTMLElement>()
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const action = computed(() => (pending.value?.kind === 'command' ? pending.value.body.action : pending.value?.kind === 'retry' ? 'retry' : 'create'))
const needsSignIn = computed(() => error.value === 'unauthenticated' || session.state.value === 'guest')

function consent() {
  return { accepted: accepted.value, version: policy.value?.terms.version ?? '', digest: policy.value?.terms.digest ?? '' }
}
function reset() {
  editing.value = null
  instance.value = ''
  limit.value = ''
  reserve.value = '0'
  until.value = ''
  accepted.value = false
  invalid.value = false
}
function edit(item: Contribution, mode: 'configure' | 'renew') {
  editing.value = { item, mode }
  limit.value = gbInput(item.conditions.limit_bytes)
  reserve.value = gbInput(item.conditions.personal_reserve)
  until.value = localDateInput(Date.parse(item.conditions.until))
  accepted.value = false
  invalid.value = false
  void nextTick(() => formTitle.value?.focus())
}
function review() {
  const current = policy.value
  if (!current) return
  const change = editing.value
  const result = conditions(limit.value, reserve.value, until.value, current, Date.now(), change?.mode === 'configure' ? change.item.conditions.until : undefined)
  const needsConsent = change?.mode !== 'configure'
  if (!result || (needsConsent && !accepted.value) || (!change && !options.value?.items.some((item) => item.id === instance.value)) || (change?.mode === 'renew' && Date.parse(result.until) <= Date.parse(change.item.conditions.until))) {
    invalid.value = true
    return
  }
  invalid.value = false
  if (change) prepare({ kind: 'command', id: change.item.id, key: crypto.randomUUID(), body: { revision: change.item.revision, action: change.mode, conditions: result, ...(change.mode === 'renew' ? { consent: consent() } : {}) } })
  else prepare({ kind: 'create', key: crypto.randomUUID(), body: { instance_id: instance.value, conditions: result, consent: consent() } })
}
function command(item: Contribution, value: Command['action']) {
  prepare({ kind: 'command', id: item.id, key: crypto.randomUUID(), body: { revision: item.revision, action: value } })
}
const mutable = (item: Contribution) => item.desired_state === 'active' || item.desired_state === 'paused'

watch(error, (value) => {
  if (value === 'unauthenticated' || value === 'forbidden') reset()
})
watch(completed, (value) => {
  if (value) reset()
})
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :title="t('nav.contributions')"
      :description="t('contribution.description')"
    >
      <template #actions>
        <button
          class="btn"
          type="button"
          :disabled="locked"
          @click="reload()"
        >
          {{ t('common.refresh') }}
        </button>
        <RouterLink
          class="btn"
          to="/me/storage-accounts"
        >
          {{ t('custody.title') }}
        </RouterLink>
      </template>
    </PageHeader>

    <section
      class="card stack"
      :aria-labelledby="'contribution-summary'"
    >
      <h2 id="contribution-summary">
        {{ t('contribution.summary') }}
      </h2>
      <ErrorNotice
        v-if="publicError"
        :code="publicError"
        @retry="reload()"
      />
      <template v-if="statistics">
        <dl class="facts metrics">
          <div>
            <dt>{{ t('contribution.declared') }}</dt>
            <dd>{{ bytes(statistics.declared_bytes) }}</dd>
          </div>
          <div>
            <dt>{{ t('contribution.available') }}</dt>
            <dd>{{ bytes(statistics.available_bytes) }}</dd>
          </div>
          <div>
            <dt>{{ t('contribution.used') }}</dt>
            <dd>{{ bytes(statistics.used_bytes) }}</dd>
          </div>
        </dl>
        <p class="row small">
          <StatusTag :tone="statistics.status === 'current' ? 'success' : 'warning'">
            {{ t(statistics.status === 'current' ? 'contribution.current' : 'contribution.partial') }}
          </StatusTag>
          <span class="subtle">{{ t('contribution.observed', { time: format.dateTime(statistics.generated_at) }) }}</span>
        </p>
      </template>
      <p
        v-else-if="loading"
        class="subtle"
      >
        {{ t('common.loading') }}
      </p>
    </section>

    <div
      class="stack"
      aria-live="polite"
    >
      <p
        v-if="completed && !error"
        class="notice notice-success"
        role="status"
      >
        {{ t('contribution.accepted') }}
      </p>
      <section
        v-if="needsSignIn"
        class="card stack-sm"
      >
        <h2>{{ t('contribution.mine') }}</h2>
        <p class="muted">
          {{ t('contribution.signInHint') }}
        </p>
        <div>
          <button
            class="btn btn-primary"
            type="button"
            @click="session.signIn"
          >
            {{ t('account.signIn') }}
          </button>
        </div>
      </section>
      <ErrorNotice
        v-else-if="error && !pending"
        :code="error"
        @retry="reload()"
      />
    </div>

    <template v-if="data">
      <section
        v-if="policy && options"
        class="card stack"
      >
        <h2
          ref="formTitle"
          tabindex="-1"
        >
          {{ t(editing ? `contribution.actions.${editing.mode}` : 'contribution.create') }}
        </h2>
        <p
          v-if="!editing && options.items.length === 0"
          class="small muted"
        >
          {{ t('contribution.noOptions') }}
          <RouterLink to="/me/storage-accounts">
            {{ t('custody.connect') }}
          </RouterLink>
        </p>
        <form
          v-if="editing || options.items.length"
          class="stack"
          @submit.prevent="review"
        >
          <fieldset
            class="stack"
            :disabled="locked"
          >
            <label
              v-if="!editing"
              class="field"
            >
              <span class="field-label">{{ t('contribution.storage') }}</span>
              <select
                v-model="instance"
                class="select"
                required
              >
                <option
                  disabled
                  value=""
                >{{ t('common.choose') }}</option>
                <option
                  v-for="option in options.items"
                  :key="option.id"
                  :value="option.id"
                >{{ t('contribution.option', { adapter: option.adapter, id: option.id.slice(-8), capacity: bytes(option.available_bytes) }) }}</option>
              </select>
            </label>
            <p
              v-else
              class="mono subtle"
            >
              <bdi>{{ editing.item.id }}</bdi>
            </p>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">{{ t('contribution.limit') }}</span>
                <input
                  v-model="limit"
                  class="input"
                  inputmode="decimal"
                  required
                  pattern="[0-9]+([.][0-9]{1,9})?"
                >
              </label>
              <label class="field">
                <span class="field-label">{{ t('contribution.reserve') }}</span>
                <input
                  v-model="reserve"
                  class="input"
                  inputmode="decimal"
                  required
                  pattern="[0-9]+([.][0-9]{1,9})?"
                >
              </label>
              <label
                v-if="editing?.mode !== 'configure'"
                class="field"
              >
                <span class="field-label">{{ t('contribution.untilInput', { zone }) }}</span>
                <input
                  v-model="until"
                  class="input"
                  type="datetime-local"
                  required
                >
              </label>
            </div>
            <p class="field-hint">
              {{ t('contribution.range', { min: bytes(policy.min_bytes), max: bytes(policy.max_bytes) }) }}
            </p>
            <p
              v-if="editing?.mode !== 'configure'"
              class="field-hint"
            >
              {{ t('contribution.termRange', { min: format.number(policy.min_term_seconds / 3600), max: format.number(policy.max_term_seconds / 3600) }) }}
            </p>
            <label
              v-if="editing?.mode !== 'configure'"
              class="check"
            >
              <input
                v-model="accepted"
                type="checkbox"
                required
              >
              <span>{{ t('contribution.agree') }} <a
                :href="policy.terms.url"
                target="_blank"
                rel="noopener noreferrer"
              >{{ t('contribution.terms', { version: policy.terms.version }) }}</a></span>
            </label>
            <p
              v-if="invalid"
              class="notice notice-error"
              role="alert"
            >
              {{ t('contribution.invalidForm') }}
            </p>
            <div class="form-actions">
              <button
                class="btn btn-primary"
                type="submit"
              >
                {{ t('contribution.review') }}
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
        <button
          v-if="!editing && options.next_cursor"
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="locked"
          @click="nextOptions"
        >
          {{ t('contribution.moreOptions') }}
        </button>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>{{ t('contribution.mine') }}</h2>
          <button
            class="btn btn-sm btn-ghost"
            type="button"
            :disabled="locked"
            @click="first"
          >
            {{ t('contribution.first') }}
          </button>
        </div>
        <p
          v-if="!data.items.length"
          class="empty"
        >
          {{ t('contribution.empty') }}
        </p>
        <ul class="grid-wide list">
          <li
            v-for="item in data.items"
            :key="item.id"
          >
            <article class="card stack">
              <div class="row-between">
                <h3><bdi>{{ item.adapter }}</bdi></h3>
                <StatusTag :tone="item.state === 'active' ? 'success' : item.state === 'blocked' ? 'danger' : 'warning'">
                  {{ label('contribution.states', item.state) }}
                </StatusTag>
              </div>
              <p class="mono subtle">
                <bdi>{{ item.id }}</bdi>
              </p>
              <dl class="facts">
                <div>
                  <dt>{{ t('contribution.requested') }}</dt>
                  <dd>{{ t(`contribution.actions.${desired[item.desired_state]}`) }}</dd>
                </div>
                <div>
                  <dt>{{ t('contribution.quota') }}</dt>
                  <dd>{{ bytes(item.conditions.limit_bytes) }}</dd>
                </div>
                <div>
                  <dt>{{ t('contribution.personal') }}</dt>
                  <dd>{{ bytes(item.conditions.personal_reserve) }}</dd>
                </div>
                <div>
                  <dt>{{ t('contribution.untilLabel') }}</dt>
                  <dd>{{ format.dateTime(item.conditions.until) }}</dd>
                </div>
              </dl>
              <p
                v-if="item.reason"
                class="notice notice-warning small"
              >
                {{ label('contribution.reasons', item.reason) }}
              </p>
              <template v-if="item.observation">
                <dl class="facts">
                  <div>
                    <dt>{{ t('contribution.used') }}</dt>
                    <dd>{{ bytes(item.observation.used_bytes) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('contribution.reserved') }}</dt>
                    <dd>{{ bytes(item.observation.reserved_bytes) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('contribution.available') }}</dt>
                    <dd>{{ bytes(item.observation.available_bytes) }}</dd>
                  </div>
                </dl>
                <p class="small">
                  {{ t('contribution.remaining', { count: format.number(item.observation.remaining_replicas) }) }}
                </p>
                <p class="subtle">
                  {{ t('contribution.observed', { time: format.dateTime(item.observation.observed_at) }) }}
                </p>
              </template>
              <p
                v-if="item.exit_target_at"
                class="small"
              >
                {{ t('contribution.exitTarget', { time: format.dateTime(item.exit_target_at) }) }}
              </p>
              <div class="row">
                <button
                  v-if="item.desired_state === 'active'"
                  class="btn btn-sm"
                  type="button"
                  :disabled="locked"
                  @click="command(item, 'pause')"
                >
                  {{ t('contribution.actions.pause') }}
                </button>
                <button
                  v-if="item.desired_state === 'paused'"
                  class="btn btn-sm"
                  type="button"
                  :disabled="locked"
                  @click="command(item, 'resume')"
                >
                  {{ t('contribution.actions.resume') }}
                </button>
                <template v-if="mutable(item)">
                  <button
                    class="btn btn-sm"
                    type="button"
                    :disabled="locked || !policy"
                    @click="edit(item, 'configure')"
                  >
                    {{ t('contribution.actions.configure') }}
                  </button>
                  <button
                    class="btn btn-sm"
                    type="button"
                    :disabled="locked || !policy"
                    @click="edit(item, 'renew')"
                  >
                    {{ t('contribution.actions.renew') }}
                  </button>
                  <button
                    class="btn btn-sm btn-danger"
                    type="button"
                    :disabled="locked"
                    @click="command(item, 'exit')"
                  >
                    {{ t('contribution.actions.exit') }}
                  </button>
                </template>
                <button
                  v-if="item.state !== 'exited' && item.desired_state !== 'revoked'"
                  class="btn btn-sm btn-danger"
                  type="button"
                  :disabled="locked"
                  @click="command(item, 'revoke')"
                >
                  {{ t('contribution.actions.revoke') }}
                </button>
                <button
                  v-if="item.state === 'blocked'"
                  class="btn btn-sm"
                  type="button"
                  :disabled="locked"
                  @click="command(item, 'retry')"
                >
                  {{ t('contribution.actions.retry') }}
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
          @click="next"
        >
          {{ t('common.loadMore') }}
        </button>
      </section>
    </template>

    <SheetDialog
      :open="!!pending"
      :title="t('contribution.confirm', { action: t(`contribution.actions.${action}`) })"
      @close="cancel"
    >
      <div
        v-if="pending"
        class="stack"
      >
        <p
          v-if="pending.kind !== 'create'"
          class="mono subtle"
        >
          <bdi>{{ pending.id }}</bdi>
        </p>
        <p class="small">
          {{ t(action === 'exit' ? 'contribution.exitHint' : action === 'revoke' ? 'contribution.revokeHint' : 'contribution.confirmHint') }}
        </p>
        <p
          v-if="pending.kind !== 'retry' && pending.body.conditions"
          class="small"
        >
          {{ t('contribution.reviewConditions', { limit: bytes(pending.body.conditions.limit_bytes), reserve: bytes(pending.body.conditions.personal_reserve), until: format.dateTime(pending.body.conditions.until) }) }}
        </p>
        <p
          v-if="error"
          class="notice notice-error"
          role="alert"
        >
          {{ errorText(error) }}
        </p>
        <p
          v-if="uncertain"
          class="notice notice-warning"
          role="status"
        >
          {{ t('common.uncertain') }}
        </p>
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="sending"
            @click="submit"
          >
            {{ t(uncertain ? 'common.retryOriginal' : 'common.confirm') }}
          </button>
          <button
            v-if="!uncertain"
            class="btn"
            type="button"
            :disabled="sending"
            @click="cancel"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </SheetDialog>
  </div>
</template>

<style scoped>
.metrics { gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); }
.metrics dd { font-size: clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem); font-weight: 700; line-height: 1.1; letter-spacing: var(--tracking-title); }
</style>
