<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import AppDateTime from '../../shared/ui/AppDateTime.vue'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { computed, nextTick, ref, watch, type DeepReadonly } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { Command, Contribution as ContributionData, ProviderCapacity } from '../../api/contribution'
import { useLeaveGuard } from '../../shared/composables/leave'
import { useFormat } from '../../app/i18n'
import { feature, useCapabilities } from '../../shared/capabilities'
import { useSession } from '../../shared/session'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { useErrorText } from '../../shared/ui/messages'
import MeLayout from '../account/MeLayout.vue'
import { conditions, gbInput, localDateInput, parseGB } from './conditions'
import CustodyPanel from './CustodyPanel.vue'
import { useContributions } from './useContributions'

type Contribution = DeepReadonly<ContributionData>

// Public transparency figures, the user's contributions and the storage accounts
// behind them. Declared capacity and actually writable capacity are always shown apart.
const { t, te } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const session = useSession()
const capabilities = useCapabilities()
const custodyEnabled = computed(() => capabilities.has(feature.custody))
const { data, options, policy, statistics, loading, sending, error, errorDetail, publicError, pending, uncertain, completed, reload, prepare, cancel, submit, next, nextOptions, first } = useContributions()
const bytes = (value: number) => format.value.bytes(value)
const label = (prefix: string, value: string) => (te(`${prefix}.${value}`) ? t(`${prefix}.${value}`) : t('contribution.unknown'))
const desired: Record<Contribution['desired_state'], string> = { active: 'resume', paused: 'pause', exiting: 'exit', revoked: 'revoke' }
const locked = computed(() => loading.value || sending.value || !!pending.value)
useLeaveGuard(() => pending.value ? t('common.leaveUncertain') : sending.value ? t('common.leaveUnsaved') : '')
const instance = ref('')
const limit = ref('')
const reserve = ref('0')
const until = ref('')
const accepted = ref(false)
const displayLabel = ref('')
const editing = ref<{ item: Contribution; mode: 'configure' | 'renew' | 'reopen' } | null>(null)
const invalid = ref(false)
const formTitle = ref<HTMLElement>()
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
const route = useRoute()
const router = useRouter()
const tab = computed<'contributions' | 'accounts'>({
  get: () => (route.query.tab === 'accounts' ? 'accounts' : 'contributions'),
  set: (value) => void router.replace({ query: { ...route.query, tab: value === 'accounts' ? 'accounts' : undefined } }),
})
const tabs = computed(() => [{ value: 'contributions' as const, label: t('contribution.mine') }, { value: 'accounts' as const, label: t('custody.title') }])
const creating = ref(false)
const custody = ref<InstanceType<typeof CustodyPanel>>()
const custodyOpened = ref(tab.value === 'accounts')
watch(tab, (value) => {
  if (value === 'accounts') custodyOpened.value = true
  else {
    custody.value?.clearSecrets()
    void reload()
  }
})
function refresh() {
  void reload()
  if (tab.value === 'accounts') custody.value?.refresh()
}
const paged = ref(false)
const showForm = computed(() => !!editing.value || creating.value)
function goNext() { paged.value = true; void next() }
function goFirst() { paged.value = false; void first() }
const action = computed(() => (pending.value?.kind === 'command' ? pending.value.body.action : pending.value?.kind === 'retry' ? 'retry' : 'create'))
// The server refused the quota because of the drive's own space; reloading reads it again.
const capacityRejection = computed(() => (errorDetail.value === 'limit_exceeds_provider_capacity' || errorDetail.value === 'provider_capacity_unavailable' ? errorDetail.value : null))
const needsSignIn = computed(() => error.value === 'unauthenticated' || session.state.value === 'guest')

function consent() {
  return { accepted: accepted.value, version: policy.value?.terms.version ?? '', digest: policy.value?.terms.digest ?? '' }
}
function reset() {
  editing.value = null
  creating.value = false
  instance.value = ''
  limit.value = ''
  reserve.value = '0'
  until.value = ''
  accepted.value = false
  displayLabel.value = ''
  invalid.value = false
}
function edit(item: Contribution, mode: 'configure' | 'renew' | 'reopen') {
  editing.value = { item, mode }
  limit.value = gbInput(item.conditions.limit_bytes)
  reserve.value = gbInput(item.conditions.personal_reserve)
  until.value = mode === 'reopen' ? '' : localDateInput(Date.parse(item.conditions.until))
  // Only "configure" may change the nickname; renewal and reopening never send it.
  displayLabel.value = mode === 'configure' ? item.display_label ?? '' : ''
  accepted.value = false
  invalid.value = false
  void nextTick(() => formTitle.value?.focus())
}
// The provider's own quota for the whole storage account, shown next to the platform ledger so
// the owner can see how much is left to contribute. Only the owner's views carry it.
const capacityOf = (item: Contribution | DeepReadonly<{ provider_capacity?: ProviderCapacity }>) => ('provider_capacity' in item ? item.provider_capacity : undefined)
// "Updated" means the last successful provider quota read, not when the page was loaded.
const observedAt = (item: Contribution) => { const capacity = capacityOf(item); return capacity ? capacity.observed_at : item.observation?.observed_at ?? null }
const selectedOption = computed(() => options.value?.items.find((item) => item.id === instance.value))
const formCapacity = computed(() => (editing.value ? capacityOf(editing.value.item) : selectedOption.value?.provider_capacity))
// New contributions: the server's limit already leaves the safety margin; the personal reserve
// typed here comes off it as well, and the policy's own maximum still applies.
const maxContribution = computed(() => {
  const base = selectedOption.value?.max_contributable_bytes
  if (editing.value || base === undefined) return undefined
  if (base === null) return null
  const reserveBytes = parseGB(reserve.value) ?? 0
  return Math.min(policy.value?.max_bytes ?? base, Math.max(0, base - reserveBytes))
})
const overCapacity = computed(() => {
  const requested = parseGB(limit.value)
  return typeof maxContribution.value === 'number' && requested !== null && requested > maxContribution.value
})
// The API limits a nickname to 32 characters (code points), not UTF-16 units.
const noteTooLong = computed(() => [...displayLabel.value.trim()].length > 32)
function review() {
  const current = policy.value
  if (!current) return
  const change = editing.value
  if (noteTooLong.value || (!change && (maxContribution.value === null || overCapacity.value))) { invalid.value = true; return }
  const note = displayLabel.value.trim()
  // Renaming alone keeps the saved quota, reserve and end date as they are, even when they no
  // longer fit the current policy, so it is sent without conditions and is not re-checked.
  if (change?.mode === 'configure' && limit.value === gbInput(change.item.conditions.limit_bytes) && reserve.value === gbInput(change.item.conditions.personal_reserve)) {
    invalid.value = false
    if (note === (change.item.display_label ?? '')) { reset(); return }
    prepare({ kind: 'command', id: change.item.id, key: crypto.randomUUID(), body: { revision: change.item.revision, action: 'configure', display_label: note } })
    return
  }
  const result = conditions(limit.value, reserve.value, until.value, current, Date.now(), change?.mode === 'configure' ? change.item.conditions.until : undefined)
  const needsConsent = change?.mode !== 'configure'
  if (!result || (needsConsent && !accepted.value) || (!change && !options.value?.items.some((item) => item.id === instance.value)) || (change?.mode === 'renew' && Date.parse(result.until) <= Date.parse(change.item.conditions.until))) {
    invalid.value = true
    return
  }
  invalid.value = false
  // The server trims and clears on "". Creation sends a nickname if given; configure only when
  // it changed; renew and reopen never carry one.
  const noteChange = change?.mode === 'configure' ? (note !== (change.item.display_label ?? '') ? { display_label: note } : {}) : !change && note ? { display_label: note } : {}
  if (change) prepare({ kind: 'command', id: change.item.id, key: crypto.randomUUID(), body: { revision: change.item.revision, action: change.mode, conditions: result, ...noteChange, ...(needsConsent ? { consent: consent() } : {}) } })
  else prepare({ kind: 'create', key: crypto.randomUUID(), body: { instance_id: instance.value, conditions: result, consent: consent(), ...noteChange } })
}
function command(item: Contribution, value: Command['action']) {
  prepare({ kind: 'command', id: item.id, key: crypto.randomUUID(), body: { revision: item.revision, action: value } })
}
// A request only needs mentioning while the contribution has not reached it yet.
const settled = (item: Contribution) => item.state === item.desired_state
const leaving = (item: Contribution) => item.desired_state === 'exiting' || item.desired_state === 'revoked'
const adapterName = (id: string) => (id === 'bhpan' ? 'BHpan' : id)
// Two accounts of the same provider must stay distinguishable: the owner's note wins,
// otherwise the masked provider login, otherwise the record's own identifier tail.
// Masks can collide (same first and last characters), so a hint shared by two of the reader's
// accounts also gets the record's identifier tail.
const hintCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const item of [...(data.value?.items ?? []), ...(options.value?.items ?? [])]) if (item.account_hint) counts.set(item.account_hint, (counts.get(item.account_hint) ?? 0) + 1)
  return counts
})
const accountTag = (item: { account_hint?: string; id: string }) => (item.account_hint ? ((hintCounts.value.get(item.account_hint) ?? 0) > 1 ? `${item.account_hint} #${item.id.slice(-4)}` : item.account_hint) : item.id.slice(-8))
const account = (item: { adapter: string; account_hint?: string; id: string }) => `${adapterName(item.adapter)} · ${accountTag(item)}`
const mutable = (item: Contribution) => item.desired_state === 'active' || item.desired_state === 'paused'

watch(error, (value) => {
  if (value === 'unauthenticated' || value === 'forbidden') reset()
})
watch(completed, (value) => {
  if (value) reset()
})
</script>

<template>
  <MeLayout
    :title="t('nav.contributions')"
    :description="t('contribution.description')"
    :require-sign-in="false"
  >
    <template #actions>
      <button
        class="btn btn-sm btn-ghost"
        type="button"
        :disabled="locked"
        @click="refresh"
      >
        <RefreshCw aria-hidden="true" />{{ t('common.refresh') }}
      </button>
    </template>

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
        <p
          v-if="statistics.status !== 'current'"
          class="notice notice-warning small"
        >
          {{ t('contribution.partial') }}
        </p>
        <p class="subtle">
          {{ t('contribution.observed', { time: format.dateTime(statistics.generated_at) }) }}
        </p>
      </template>
      <p
        v-else-if="loading"
        class="subtle"
      >
        {{ t('common.loading') }}
      </p>
    </section>

    <TabBar
      v-if="session.state.value === 'member' && !needsSignIn"
      v-model="tab"
      :tabs="tabs"
      :label="t('nav.contributions')"
      id-prefix="storage"
    />
    <CustodyPanel
      v-if="custodyOpened && custodyEnabled && session.state.value === 'member' && !needsSignIn"
      v-show="tab === 'accounts'"
      ref="custody"
      @updated="reload()"
    />
    <p
      v-if="tab === 'accounts' && session.state.value === 'member' && !needsSignIn && !custodyEnabled"
      class="notice"
      role="status"
    >
      {{ t(capabilities.status.value === 'ready' ? 'custody.disabled' : 'common.loading') }}
    </p>
    <div
      v-if="(tab === 'contributions' || needsSignIn) && ((completed && !error) || needsSignIn || (error && !pending))"
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
        v-else-if="error && !pending && !capacityRejection"
        :code="error"
        @retry="reload()"
      />
      <div
        v-else-if="error && !pending"
        class="notice notice-error"
        role="alert"
      >
        <span>{{ t(`contribution.provider.errors.${capacityRejection}`) }}</span>
        <button
          class="btn btn-sm"
          type="button"
          @click="reload()"
        >
          {{ t('common.retry') }}
        </button>
      </div>
    </div>

    <template v-if="data && tab === 'contributions'">
      <section
        v-if="policy && options && showForm"
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
          <button
            class="btn btn-sm"
            type="button"
            @click="tab = 'accounts'"
          >
            {{ t('custody.connect') }}
          </button>
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
              <AppSelect
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
                >{{ t('contribution.option', { adapter: adapterName(option.adapter), id: accountTag(option), capacity: bytes(option.available_bytes) }) }}</option>
              </AppSelect>
            </label>
            <div
              v-if="formCapacity"
              class="provider-capacity"
              role="group"
              :aria-label="t('contribution.provider.title')"
            >
              <span class="field-label">{{ t('contribution.provider.title') }}</span>
              <dl
                v-if="formCapacity.status === 'available'"
                class="facts"
              >
                <div>
                  <dt>{{ t('contribution.provider.total') }}</dt>
                  <dd>{{ bytes(formCapacity.total_bytes ?? 0) }}</dd>
                </div>
                <div>
                  <dt>{{ t('contribution.provider.used') }}</dt>
                  <dd>{{ bytes(formCapacity.used_bytes ?? 0) }}</dd>
                </div>
                <div>
                  <dt>{{ t('contribution.provider.remaining') }}</dt>
                  <dd>{{ bytes(formCapacity.remaining_bytes ?? 0) }}</dd>
                </div>
              </dl>
              <p
                v-else
                class="notice notice-warning small"
              >
                {{ t(`contribution.provider.status.${formCapacity.status}`) }}
              </p>
              <p
                v-if="formCapacity.observed_at"
                class="subtle"
              >
                {{ t('contribution.observed', { time: format.dateTime(formCapacity.observed_at) }) }}
              </p>
            </div>
            <label
              v-if="!editing || editing.mode === 'configure'"
              class="field"
            >
              <span class="field-label">{{ t('contribution.displayLabel') }}</span>
              <input
                v-model="displayLabel"
                class="input"
                maxlength="64"
                autocomplete="off"
                :aria-invalid="noteTooLong || undefined"
                :aria-describedby="noteTooLong ? 'contribution-label-error' : undefined"
                :placeholder="t('contribution.displayLabelHint')"
              >
              <span
                v-if="noteTooLong"
                id="contribution-label-error"
                class="field-error"
                role="alert"
              >{{ t('contribution.displayLabelTooLong') }}</span>
            </label>
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
                <AppDateTime
                  v-model="until"
                  :aria-label="t('contribution.untilInput', { zone })"
                  required
                />
              </label>
            </div>
            <p
              v-if="typeof maxContribution === 'number'"
              class="field-hint"
              :class="{ 'field-error': overCapacity }"
              :role="overCapacity ? 'alert' : undefined"
            >
              {{ t(overCapacity ? 'contribution.provider.over' : 'contribution.provider.max', { max: bytes(maxContribution) }) }}
            </p>
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
              {{ t(maxContribution === null ? 'contribution.provider.unavailable' : overCapacity ? 'contribution.provider.over' : 'contribution.invalidForm', { max: bytes(typeof maxContribution === 'number' ? maxContribution : 0) }) }}
            </p>
            <div class="form-actions">
              <button
                class="btn btn-primary"
                type="submit"
              >
                {{ t('contribution.review') }}
              </button>
              <button
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
              v-if="policy && !showForm"
              class="btn btn-sm btn-primary"
              type="button"
              :disabled="locked"
              @click="creating = true"
            >
              {{ t('contribution.create') }}
            </button>
          </div>
        </div>
        <p
          v-if="!data.items.length"
          class="empty"
        >
          {{ t('contribution.empty') }}
        </p>
        <ul class="list">
          <li
            v-for="item in data.items"
            :key="item.id"
          >
            <article class="card stack">
              <div class="row-between">
                <div class="card-heading">
                  <h3><bdi>{{ item.display_label || account(item) }}</bdi></h3>
                  <p
                    v-if="item.display_label"
                    class="subtle"
                  >
                    <bdi>{{ account(item) }}</bdi>
                  </p>
                </div>
                <StatusTag :tone="item.state === 'active' ? 'success' : item.state === 'blocked' ? 'danger' : 'warning'">
                  {{ label('contribution.states', item.state) }}
                </StatusTag>
              </div>
              <dl class="facts">
                <div v-if="!settled(item)">
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
              <template v-if="capacityOf(item)">
                <dl
                  v-if="capacityOf(item)?.status === 'available'"
                  class="facts"
                  :aria-label="t('contribution.provider.title')"
                >
                  <div>
                    <dt>{{ t('contribution.provider.total') }}</dt>
                    <dd>{{ bytes(capacityOf(item)?.total_bytes ?? 0) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('contribution.provider.used') }}</dt>
                    <dd>{{ bytes(capacityOf(item)?.used_bytes ?? 0) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('contribution.provider.remaining') }}</dt>
                    <dd>{{ bytes(capacityOf(item)?.remaining_bytes ?? 0) }}</dd>
                  </div>
                </dl>
                <p
                  v-else-if="!item.reason"
                  class="notice notice-warning small"
                >
                  {{ t(`contribution.provider.status.${capacityOf(item)?.status}`) }}
                </p>
              </template>
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
                <p
                  v-if="leaving(item)"
                  class="small"
                >
                  {{ t('contribution.remaining', { count: format.number(item.observation.remaining_replicas) }) }}
                </p>
                <p class="subtle">
                  {{ observedAt(item) ? t('contribution.observed', { time: format.dateTime(observedAt(item) ?? '') }) : t('contribution.neverObserved') }}
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
                <button
                  v-if="item.state === 'exited'"
                  class="btn btn-sm"
                  type="button"
                  :disabled="locked || !policy"
                  @click="edit(item, 'reopen')"
                >
                  {{ t('contribution.actions.reopen') }}
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
          @click="goNext"
        >
          {{ t('common.next') }}
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
          v-if="pending.kind !== 'retry' && pending.body.display_label !== undefined"
          class="small"
        >
          <template v-if="pending.body.display_label">
            {{ t('contribution.reviewLabel') }}<bdi>{{ pending.body.display_label }}</bdi>
          </template>
          <template v-else>
            {{ t('contribution.reviewLabelCleared') }}
          </template>
        </p>
        <p
          v-if="error"
          class="notice notice-error"
          role="alert"
        >
          {{ capacityRejection ? t(`contribution.provider.errors.${capacityRejection}`) : errorText(error) }}
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
  </MeLayout>
</template>

<style scoped>
.card-heading { min-width: 0; overflow-wrap: anywhere; }
.provider-capacity { display: grid; gap: .5rem; }
.provider-capacity .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
article .facts { grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); }
.metrics { gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr)); }
.metrics dd { font-size: clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem); font-weight: 700; line-height: 1.1; letter-spacing: var(--tracking-title); }
</style>
