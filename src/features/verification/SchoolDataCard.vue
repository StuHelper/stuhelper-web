<script setup lang="ts">
import { DatabaseZap, ShieldCheck } from 'lucide-vue-next'
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useAsync, useMutation } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { toast } from '../../shared/ui/toast'
import { useVerification, type SchoolDataAuthorization } from './api'

// School data authorization: the person lets the server keep their school account,
// verify it periodically and read their own enrollment. Nothing personal is read
// without it, and revoking deletes the stored account at once.
const props = defineProps<{ eligible: boolean }>()
const { t } = useI18n()
const format = useFormat()
const api = useVerification()

const status = useAsync((signal) => api.schoolData(signal), { keepData: true })
void status.reload()
const shown = status.data
const refresh = () => { void status.reload() }
onMounted(() => window.addEventListener('focus', refresh))
onScopeDispose(() => window.removeEventListener('focus', refresh))
watch(() => shown.value?.expires_at, (expires, _, cleanup) => {
  if (!expires) return
  const remaining = Date.parse(expires) - Date.now()
  if (remaining <= 0) return
  const timer = window.setTimeout(refresh, remaining)
  cleanup(() => window.clearTimeout(timer))
})
const active = computed(() => shown.value?.state === 'active')

const studentId = ref('')
const password = ref('')
const accepted = ref(false)
const submit = useMutation()
const revoke = useMutation()
const confirming = ref(false)
const ready = computed(() => props.eligible && !!studentId.value.trim() && !!password.value && accepted.value && !submit.busy.value && !submit.uncertain.value)

async function open() {
  if (!ready.value) return
  const input = { student_id: studentId.value.trim(), password: password.value, accepted: true as const }
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
  const result = (retrying ? await revoke.retry() : await revoke.run('school-data-revoke', {}, () => api.revokeSchoolData())) as SchoolDataAuthorization | undefined
  if (!result) return
  status.data.value = result
  refresh()
  confirming.value = false
  toast(t('verification.schoolData.revoked'))
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
        {{ t(active ? 'verification.schoolData.active' : 'verification.schoolData.inactive') }}
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
      <li>{{ t('verification.schoolData.points.validity') }}</li>
      <li>{{ t('verification.schoolData.points.labels') }}</li>
      <li>{{ t('verification.schoolData.points.revoke') }}</li>
    </ul>

    <ErrorNotice
      v-if="status.status.value === 'error' && !shown"
      :code="status.error.value"
      @retry="status.reload()"
    />

    <template v-else-if="active && shown">
      <div class="school-data-active">
        <ShieldCheck aria-hidden="true" />
        <dl class="school-data-facts">
          <div v-if="shown.verified_at">
            <dt>{{ t('verification.schoolData.verifiedAt') }}</dt>
            <dd>{{ format.dateTime(shown.verified_at) }}</dd>
          </div>
          <div v-if="shown.expires_at">
            <dt>{{ t('verification.schoolData.expiresAt') }}</dt>
            <dd>{{ format.dateTime(shown.expires_at) }}</dd>
          </div>
        </dl>
      </div>
      <div class="form-actions">
        <button
          class="btn btn-sm btn-ghost danger-text"
          type="button"
          @click="confirming = true"
        >
          {{ t('verification.schoolData.revoke') }}
        </button>
      </div>
    </template>

    <form
      v-else-if="shown"
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
          {{ t('verification.schoolData.submit') }}
        </button>
      </div>
    </form>

    <ConfirmDialog
      :open="confirming"
      :title="t('verification.schoolData.revokeTitle')"
      :message="t('verification.schoolData.revokeMessage')"
      :confirm-label="t('verification.schoolData.revoke')"
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
.school-data-active { display: flex; align-items: flex-start; gap: .75rem; padding: .75rem 1rem; border-radius: var(--radius); background: var(--success-soft); }
.school-data-active > svg { flex: none; width: 22px; height: 22px; color: var(--success); }
.school-data-facts { display: flex; flex-wrap: wrap; gap: .25rem 1.5rem; margin: 0; }
.school-data-facts dt { color: var(--label-2); font-size: .8125rem; }
.school-data-facts dd { margin: 0; font-weight: 550; }
.danger-text { color: var(--danger); }
</style>
