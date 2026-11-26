<script setup lang="ts">
import { DatabaseZap, ShieldCheck } from 'lucide-vue-next'
import { computed, onMounted, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useAsync, useMutation } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { toast } from '../../shared/ui/toast'
import { schoolDataHistoryNotice, useVerification, type SchoolDataAuthorization, type SchoolDataTerm } from './api'

// School data authorization is granted by term. A successful check authorizes the person's
// own enrollment up to the term in which it succeeded, and each successful recheck extends it.
// Stopping rechecks deletes the stored account and password; the terms already authorized stay
// readable and later terms are never read. Nothing personal is read without an authorization.
const props = defineProps<{ eligible: boolean; withdrawOnly?: boolean }>()
const { t } = useI18n()
const format = useFormat()
const api = useVerification()

const status = useAsync((signal) => api.schoolData(signal), { keepData: true })
void status.reload()
const shown = status.data
const refresh = () => { void status.reload() }
onMounted(() => window.addEventListener('focus', refresh))
onScopeDispose(() => window.removeEventListener('focus', refresh))
const active = computed(() => shown.value?.state === 'active')
const historical = computed(() => shown.value?.state === 'historical')
const termLabel = (term: SchoolDataTerm) => t('verification.schoolData.term', { year: format.value.number(term.year, { useGrouping: false }), season: t(`verification.schoolData.seasons.${term.season}`) })
const through = computed(() => (shown.value?.authorized_through ? termLabel(shown.value.authorized_through) : ''))
const tag = computed(() => (active.value ? 'active' : historical.value ? 'historical' : 'inactive'))

const studentId = ref('')
const password = ref('')
const accepted = ref(false)
const submit = useMutation()
const revoke = useMutation()
const history = useMutation()
const historyAccepted = ref(false)
const confirming = ref(false)
const ready = computed(() => props.eligible && !!studentId.value.trim() && !!password.value && accepted.value && !submit.busy.value && !submit.uncertain.value)

async function open() {
  if (!ready.value) return
  // The consent box covers the term rules shown above, so their version goes with it.
  const input = { student_id: studentId.value.trim(), password: password.value, accepted: true as const, history_notice_version: schoolDataHistoryNotice }
  opened(await submit.run('school-data', input, (body) => api.submitSchoolData(body)))
}
// Only a lost response can be retried, with the same request and key.
async function retryOpen() {
  opened((await submit.retry()) as SchoolDataAuthorization | undefined)
}
function opened(result: SchoolDataAuthorization | undefined) {
  // A rejected password is never kept for another try; the student ID stays.
  if (!submit.uncertain.value) password.value = ''
  if (!result) return
  status.data.value = result
  refresh()
  accepted.value = false
  toast(t('verification.schoolData.opened'))
}

async function withdraw(retrying = false) {
  const result = (retrying ? await revoke.retry() : await revoke.run('school-data-stop', {}, () => api.stopSchoolData())) as SchoolDataAuthorization | undefined
  if (!result) return
  status.data.value = result
  refresh()
  confirming.value = false
  toast(t('verification.schoolData.stopped'))
}

async function keepHistory(retrying = false) {
  if (!retrying && !historyAccepted.value) return
  const result = (retrying ? await history.retry() : await history.run('school-data-history', {}, () => api.confirmSchoolDataHistory())) as SchoolDataAuthorization | undefined
  if (!result) return
  status.data.value = result
  historyAccepted.value = false
  refresh()
  toast(t('verification.schoolData.historyConsent.done'))
}

const errorText = (code: string) => ((code === 'information_mismatch' || code === 'forbidden') ? t('verification.schoolData.mismatch') : '')
</script>

<template>
  <section
    id="school-data"
    class="card stack school-data"
    aria-labelledby="school-data-title"
    :aria-busy="status.status.value === 'loading'"
  >
    <div class="row-between">
      <h2
        id="school-data-title"
        class="school-data-title"
      >
        <DatabaseZap aria-hidden="true" />{{ t('verification.schoolData.title') }}
      </h2>
      <StatusTag
        v-if="shown"
        :tone="active ? 'success' : 'neutral'"
      >
        {{ t(`verification.schoolData.${tag}`) }}
      </StatusTag>
      <span
        v-else-if="status.status.value === 'loading'"
        class="skeleton-tag"
        aria-hidden="true"
      />
    </div>
    <p class="muted">
      {{ t('verification.schoolData.intro') }}
    </p>
    <ul class="school-data-points">
      <li>{{ t('verification.schoolData.points.storage') }}</li>
      <li>{{ t('verification.schoolData.points.terms') }}</li>
      <li>{{ t('verification.schoolData.points.validity') }}</li>
      <li>{{ t('verification.schoolData.points.labels') }}</li>
      <li>{{ t('verification.schoolData.points.revoke') }}</li>
    </ul>

    <ErrorNotice
      v-if="status.status.value === 'error' && !shown"
      :code="status.error.value"
      @retry="status.reload()"
    />

    <div
      v-else-if="shown && (active || historical)"
      class="school-data-scope"
      :class="{ 'is-active': active }"
    >
      <ShieldCheck aria-hidden="true" />
      <div class="stack-sm">
        <dl class="school-data-facts">
          <div>
            <dt>{{ t('verification.schoolData.through') }}</dt>
            <dd>{{ through || t('verification.schoolData.throughUnknown') }}</dd>
          </div>
          <div v-if="shown.verified_at">
            <dt>{{ t('verification.schoolData.verifiedAt') }}</dt>
            <dd>{{ format.dateTime(shown.verified_at) }}</dd>
          </div>
        </dl>
        <p
          v-if="historical"
          class="small"
        >
          {{ through ? t('verification.schoolData.historicalNote', { term: through }) : t('verification.schoolData.historicalNoTerm') }}
        </p>
      </div>
    </div>

    <form
      v-if="shown?.history_consent_required"
      class="notice notice-warning stack-sm"
      @submit.prevent="keepHistory()"
    >
      <strong>{{ t('verification.schoolData.historyConsent.title') }}</strong>
      <p>{{ t('verification.schoolData.historyConsent.text') }}</p>
      <label class="check">
        <input
          v-model="historyAccepted"
          type="checkbox"
          :disabled="history.busy.value || history.uncertain.value"
        >
        <span>{{ t('verification.schoolData.historyConsent.check') }}</span>
      </label>
      <MutationNotice
        :busy="history.busy.value"
        :error="history.error.value"
        :uncertain="history.uncertain.value"
        @retry="keepHistory(true)"
      />
      <div class="form-actions">
        <button
          class="btn btn-sm btn-primary"
          type="submit"
          :disabled="!historyAccepted || history.busy.value || history.uncertain.value"
        >
          {{ t('verification.schoolData.historyConsent.submit') }}
        </button>
      </div>
    </form>

    <form
      v-if="shown && !active && !withdrawOnly"
      class="stack"
      autocomplete="off"
      @submit.prevent="open"
    >
      <p
        v-if="!eligible"
        class="notice notice-warning"
      >
        {{ t('verification.schoolData.needsCampus') }}
      </p>
      <div class="school-data-fields">
        <label class="field">
          <span class="field-label">{{ t('verification.studentId') }}</span>
          <input
            v-model="studentId"
            class="input"
            autocomplete="username"
            inputmode="text"
            maxlength="64"
            required
            :disabled="!eligible || submit.busy.value"
          >
        </label>
        <label class="field">
          <span class="field-label">{{ t('verification.schoolData.password') }}</span>
          <input
            v-model="password"
            class="input"
            type="password"
            autocomplete="current-password"
            maxlength="256"
            required
            :disabled="!eligible || submit.busy.value"
          >
        </label>
      </div>
      <label class="check">
        <input
          v-model="accepted"
          type="checkbox"
          :disabled="!eligible || submit.busy.value"
        >
        <span>{{ t('verification.schoolData.consent') }}</span>
      </label>
      <p
        v-if="errorText(submit.error.value)"
        class="notice notice-error"
        role="alert"
      >
        {{ errorText(submit.error.value) }}
      </p>
      <MutationNotice
        v-else
        :busy="submit.busy.value"
        :error="submit.error.value"
        :uncertain="submit.uncertain.value"
        @retry="retryOpen"
      />
      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="!ready"
        >
          {{ t(historical ? 'verification.schoolData.reopen' : 'verification.schoolData.submit') }}
        </button>
      </div>
    </form>

    <div
      v-if="active"
      class="form-actions"
    >
      <button
        class="btn btn-sm btn-ghost danger-text"
        type="button"
        @click="confirming = true"
      >
        {{ t('verification.schoolData.stop') }}
      </button>
    </div>
    <ConfirmDialog
      :open="confirming"
      :title="t('verification.schoolData.stopTitle')"
      :message="through ? t('verification.schoolData.stopMessage', { term: through }) : t('verification.schoolData.stopMessageNoTerm')"
      :confirm-label="t('verification.schoolData.stop')"
      danger
      :busy="revoke.busy.value"
      :uncertain="revoke.uncertain.value"
      :error="revoke.error.value"
      @confirm="withdraw()"
      @retry="withdraw(true)"
      @cancel="confirming = false"
    />
  </section>
</template>

<style scoped>
.school-data-title { display: flex; align-items: center; gap: .5rem; font-size: 1.0625rem; font-weight: 620; }
.school-data-title svg { width: 20px; height: 20px; color: var(--accent); }
.school-data-points { display: grid; gap: .375rem; margin: 0; padding-inline-start: 1.25rem; color: var(--label-2); font-size: .875rem; }
.school-data-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); gap: .75rem; }
.school-data-scope { display: flex; align-items: flex-start; gap: .75rem; padding: .75rem 1rem; border-radius: var(--radius); background: var(--fill); }
.school-data-scope > svg { flex: none; width: 22px; height: 22px; color: var(--label-2); }
.school-data-scope.is-active { background: var(--success-soft); }
.school-data-scope.is-active > svg { color: var(--success); }
.school-data-facts { display: flex; flex-wrap: wrap; gap: .25rem 1.5rem; margin: 0; }
.school-data-facts dt { color: var(--label-2); font-size: .8125rem; }
.school-data-facts dd { margin: 0; font-weight: 550; }
.danger-text { color: var(--danger); }
</style>
