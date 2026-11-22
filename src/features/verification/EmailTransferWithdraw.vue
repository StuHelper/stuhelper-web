<script setup lang="ts">
import { Globe2 } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import { useErrorText } from '../../shared/ui/messages'
import { toast } from '../../shared/ui/toast'
import { useVerification } from './api'

// Withdrawing the separate consent to deliver school-email codes through the provider abroad.
// Codes already sent stay valid until they expire; queued deliveries and retries stop, and
// the next outbound code asks again. Shown only while a consent is in effect.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useVerification()
const status = useAsync((signal) => api.get('EmailTransferConsentStatus', '/api/v1/verification/email-transfer-consent', signal))
void status.reload()
const confirming = ref(false)
const busy = ref(false)

async function withdraw() {
  if (busy.value) return
  busy.value = true
  try {
    await api.write('EmailTransferWithdrawal', '/api/v1/verification/email-transfer-consent', undefined, 'DELETE')
    confirming.value = false
    toast(t('verification.transfer.withdrawn'))
    await status.reload()
  } catch (failure) {
    toast(errorText(errorCode(failure)))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section
    v-if="status.data.value?.accepted"
    class="section"
    aria-labelledby="email-transfer-consent"
  >
    <h2
      id="email-transfer-consent"
      class="d-title"
    >
      {{ t('verification.transfer.title') }}
    </h2>
    <div class="card row-between">
      <p class="muted small grow">
        <Globe2 aria-hidden="true" />
        {{ status.data.value.accepted_at ? t('verification.transfer.acceptedAt', { time: format.dateTime(status.data.value.accepted_at) }) : t('verification.transfer.accepted') }}
      </p>
      <button
        class="btn btn-sm"
        type="button"
        :disabled="busy"
        @click="confirming = true"
      >
        {{ t('verification.transfer.withdraw') }}
      </button>
    </div>
    <ConfirmDialog
      :open="confirming"
      :title="t('verification.transfer.withdraw')"
      :message="t('verification.transfer.withdrawConfirm')"
      :confirm-label="t('verification.transfer.withdraw')"
      :busy="busy"
      @confirm="withdraw"
      @cancel="confirming = false"
    />
  </section>
</template>

<style scoped>
.grow { flex: 1 1 14rem; }
.grow svg { width: 1em; height: 1em; vertical-align: -.125em; }
</style>
