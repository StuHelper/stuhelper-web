<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import EmailTransferFacts from './EmailTransferFacts.vue'
import { toast } from '../../shared/ui/toast'
import { useVerification } from './api'

const props = withDefaults(defineProps<{ always?: boolean }>(), { always: false })
const { t } = useI18n()
const format = useFormat()
const path = '/api/v1/verification/email-transfer-consent'
const api = useVerification()
const status = useAsync((signal) => api.get('EmailTransferConsentStatus', path, signal))
// A deployment without this endpoint returns 404. An unpublished document returns 503.
const loadFailed = computed(() => status.status.value === 'error' && status.error.value !== 'not_found')
void status.reload()
const dialog = ref<'enable' | 'withdraw'>()
const busy = ref(false)
const writeError = ref('')
const changed = ref(false)

function openDialog(action: 'enable' | 'withdraw') {
  writeError.value = ''
  dialog.value = action
}

async function confirm() {
  const current = status.data.value
  if (busy.value || !current || !dialog.value) return
  busy.value = true
  writeError.value = ''
  try {
    if (dialog.value === 'enable') {
      const { document_id, version, digest } = current.document
      await api.write('EmailTransferConsentStatus', path, { document_id, version, digest, accepted: true }, 'PUT')
      toast(t('verification.transfer.accepted'))
    } else {
      await api.write('EmailTransferWithdrawal', path, undefined, 'DELETE')
      toast(t('verification.transfer.withdrawn'))
    }
    dialog.value = undefined
    changed.value = false
    await status.reload()
  } catch (failure) {
    const code = errorCode(failure)
    if (code === 'email_transfer_consent_changed') {
      changed.value = true
      dialog.value = undefined
      await status.reload()
    } else {
      writeError.value = code
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section
    v-if="status.data.value?.accepted || loadFailed || (props.always && (status.data.value || status.status.value === 'loading'))"
    class="section"
    aria-labelledby="email-transfer-consent"
  >
    <div class="row">
      <h2
        id="email-transfer-consent"
        class="d-title"
      >
        {{ t('verification.transfer.title') }}
      </h2>
      <span
        v-if="status.data.value"
        class="badge"
      >
        {{ t(status.data.value.accepted ? 'verification.transfer.accepted' : 'verification.transfer.notAccepted') }}
      </span>
    </div>
    <p
      v-if="status.status.value === 'loading'"
      role="status"
    >
      {{ t('common.loading') }}
    </p>
    <ErrorNotice
      v-else-if="loadFailed"
      :code="status.error.value"
      @retry="status.reload"
    />
    <template v-else-if="status.data.value">
      <p
        v-if="changed"
        class="notice notice-warning"
        role="alert"
      >
        {{ t('verification.transfer.changed') }}
      </p>
      <div class="card row-between">
        <p
          v-if="status.data.value.accepted_at"
          class="muted small"
        >
          {{ t('verification.transfer.acceptedAt', { time: format.dateTime(status.data.value.accepted_at) }) }}
        </p>
        <p
          v-else-if="!status.data.value.accepted"
          class="muted small"
        >
          {{ t('verification.transfer.enableInfo') }}
        </p>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="busy"
          @click="openDialog(status.data.value.accepted ? 'withdraw' : 'enable')"
        >
          {{ t(status.data.value.accepted ? 'verification.transfer.withdraw' : 'verification.transfer.enable') }}
        </button>
      </div>
      <ConfirmDialog
        :open="!!dialog"
        :title="t(dialog === 'withdraw' ? 'verification.transfer.withdraw' : 'verification.transfer.title')"
        :message="t(dialog === 'withdraw' ? 'verification.transfer.withdrawConfirm' : 'verification.transfer.enableInfo')"
        :confirm-label="t(dialog === 'withdraw' ? 'verification.transfer.withdraw' : 'verification.transfer.agreeEnable')"
        :error="writeError"
        :busy="busy"
        @confirm="confirm"
        @cancel="dialog = undefined"
      >
        <EmailTransferFacts
          v-if="dialog === 'enable'"
          :document="status.data.value.document"
        />
      </ConfirmDialog>
    </template>
  </section>
</template>
