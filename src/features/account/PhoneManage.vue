<script setup lang="ts">
import { Phone } from 'lucide-vue-next'
import { computed, onMounted, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, errorCode } from '../../shared/api/errors'
import { useAsync, useMutation } from '../../shared/composables/async'
import { useNow } from '../../shared/composables/clock'
import { useLeaveGuard } from '../../shared/composables/leave'
import { phoneReauthenticationPath, useSession, type OwnPhone, type PhoneCodeChallenge } from '../../shared/session'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { useErrorText } from '../../shared/ui/messages'
import { toast } from '../../shared/ui/toast'

// The account's phone number lives in the shared sign-in account. Changing or removing it
// needs a fresh sign-in; the server answers 428 and the page goes to sign in again, then
// comes back here with the same dialog open. Codes stay in this form only.
const { t } = useI18n()
const errorText = useErrorText()
const session = useSession()
const route = useRoute()
const router = useRouter()
const phone = useAsync((signal) => session.ownPhone(signal))
void phone.reload()

const numberId = useId()
const editing = ref(false)
const removing = ref(false)
const form = reactive({ phone: '', code: '' })
const challenge = ref<PhoneCodeChallenge & { phone: string }>()
const sending = ref(false)
const sendError = ref('')
const resendAt = ref(0)
const now = useNow(1000, () => resendAt.value > now.value)
const resendIn = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))
const change = useMutation()
const unbind = useMutation()
useLeaveGuard(() => (change.uncertain.value || unbind.uncertain.value ? t('common.leaveUncertain') : change.busy.value || unbind.busy.value ? t('common.leaveUnsaved') : ''))

const validPhone = computed(() => /^(\+86)?1[3-9]\d{9}$/.test(form.phone.trim()))
const validCode = computed(() => /^\d{6}$/.test(form.code))
// A code belongs to the number it was sent to.
const codeFor = computed(() => (challenge.value && challenge.value.phone === form.phone.trim() ? challenge.value : undefined))

function reauthenticate(action: 'change' | 'unbind') {
  const back = new URL(window.location.href)
  back.searchParams.set('phone', action)
  window.location.assign(`${phoneReauthenticationPath}?return_to=${encodeURIComponent(back.toString())}`)
}
const needsSignIn = (failure: unknown) => errorCode(failure) === 'recent_authentication_required'

function openChange() {
  form.phone = ''
  form.code = ''
  challenge.value = undefined
  sendError.value = ''
  change.dismiss()
  editing.value = true
}
async function sendCode() {
  if (!validPhone.value || sending.value || resendIn.value) return
  sending.value = true
  sendError.value = ''
  try {
    const number = form.phone.trim()
    const issued = await session.sendPhoneCode(number)
    challenge.value = { ...issued, phone: number }
    form.code = ''
    resendAt.value = Date.now() + 60_000
  } catch (failure) {
    if (needsSignIn(failure)) return reauthenticate('change')
    sendError.value = errorCode(failure)
    if (failure instanceof ApiError && failure.retryAfter) resendAt.value = Date.now() + failure.retryAfter * 1000
  } finally {
    sending.value = false
  }
}
function settled(value: OwnPhone, message: string) {
  phone.data.value = value
  editing.value = false
  removing.value = false
  toast(message)
}
async function submitChange() {
  const current = codeFor.value
  if (!current || !validCode.value) return
  const body = { phone: current.phone, challenge_id: current.challenge_id, code: form.code }
  const saved = change.uncertain.value ? await change.retry() : await change.run(`phone:${current.challenge_id}:${form.code}`, body, (b, key) => session.changePhone(b, key))
  // retry() replays the original request, whose response was parsed as OwnPhone.
  if (saved) return settled(saved as OwnPhone, t('phone.changed'))
  if (change.error.value === 'recent_authentication_required') return reauthenticate('change')
  if (['phone_code_expired', 'phone_code_attempts_exceeded'].includes(change.error.value)) { challenge.value = undefined; form.code = '' }
  if (change.error.value === 'phone_binding_changed') void phone.reload()
}
async function submitUnbind() {
  const saved = unbind.uncertain.value ? await unbind.retry() : await unbind.run('phone:unbind', null, (_b, key) => session.unbindPhone(key))
  if (saved) return settled(saved as OwnPhone, t('phone.unbound'))
  if (unbind.error.value === 'recent_authentication_required') return reauthenticate('unbind')
  if (unbind.error.value === 'phone_binding_changed') void phone.reload()
}
watch(() => form.phone, () => { sendError.value = '' })

// Back from signing in again: reopen what the person was doing, then clean the address.
onMounted(() => {
  const action = route.query.phone
  if (action !== 'change' && action !== 'unbind') return
  const query = { ...route.query }
  delete query.phone
  void router.replace({ query })
  if (action === 'change') openChange()
  else removing.value = true
})
</script>

<template>
  <li class="group-row has-icon">
    <span
      class="icon-tile"
      style="--tile:var(--c-green)"
    ><Phone aria-hidden="true" /></span>
    <span class="group-body">
      <span class="group-title">{{ t('security.phone') }}</span>
      <span
        v-if="phone.status.value === 'loading' || phone.status.value === 'idle'"
        class="skeleton-tag"
        aria-hidden="true"
      />
      <span
        v-else-if="phone.status.value === 'error'"
        class="group-detail"
      >{{ errorText(phone.error.value) }}</span>
      <span
        v-else-if="phone.data.value?.bound"
        class="group-detail"
      >{{ t('security.phoneBoundMasked', { phone: phone.data.value.masked_phone ?? '' }) }}</span>
      <span
        v-else
        class="group-detail"
      >{{ t('security.phoneMissing') }}</span>
    </span>
    <template v-if="phone.status.value === 'ready'">
      <button
        v-if="phone.data.value?.bound"
        class="btn btn-sm btn-ghost"
        type="button"
        :aria-label="t('phone.unbindLabel')"
        @click="unbind.dismiss(); removing = true"
      >
        {{ t('phone.unbind') }}
      </button>
      <button
        class="btn btn-sm"
        :class="{ 'btn-primary': !phone.data.value?.bound }"
        type="button"
        @click="openChange"
      >
        {{ phone.data.value?.bound ? t('phone.change') : t('phone.bind') }}
      </button>
    </template>
    <button
      v-else-if="phone.status.value === 'error'"
      class="btn btn-sm"
      type="button"
      @click="phone.reload()"
    >
      {{ t('common.retry') }}
    </button>
  </li>

  <SheetDialog
    :open="editing"
    :title="phone.data.value?.bound ? t('phone.changeTitle') : t('phone.bindTitle')"
    :description="t('phone.hint')"
    @close="!change.busy.value && !change.uncertain.value && (editing = false)"
  >
    <form
      class="stack"
      @submit.prevent="submitChange"
    >
      <div class="field">
        <label
          class="field-label"
          :for="numberId"
        >{{ t('phone.newNumber') }}</label>
        <span class="phone-row">
          <input
            :id="numberId"
            v-model="form.phone"
            class="input"
            type="tel"
            inputmode="tel"
            autocomplete="tel-national"
            maxlength="14"
            :placeholder="t('phone.numberPlaceholder')"
            :disabled="change.busy.value || change.uncertain.value"
            :aria-invalid="(!!form.phone && !validPhone) || undefined"
          >
          <button
            class="btn"
            type="button"
            :disabled="!validPhone || sending || resendIn > 0 || change.busy.value || change.uncertain.value"
            :aria-busy="sending || undefined"
            @click="sendCode"
          >
            {{ resendIn ? t('phone.resendIn', { seconds: resendIn }) : codeFor ? t('phone.resend') : t('phone.sendCode') }}
          </button>
        </span>
      </div>
      <p
        v-if="form.phone && !validPhone"
        class="field-hint"
      >
        {{ t('phone.numberFormat') }}
      </p>
      <p
        v-if="sendError"
        class="notice notice-error"
        role="alert"
      >
        {{ errorText(sendError) }}
      </p>
      <p
        v-else-if="codeFor"
        class="small muted"
        role="status"
      >
        {{ t('phone.sent') }}
      </p>
      <label
        v-if="codeFor"
        class="field"
      >
        <span class="field-label">{{ t('phone.code') }}</span>
        <input
          v-model.trim="form.code"
          class="input"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          :disabled="change.busy.value || change.uncertain.value"
        >
      </label>
      <MutationNotice
        :busy="change.busy.value"
        :uncertain="change.uncertain.value"
        :error="change.error.value === 'recent_authentication_required' ? '' : change.error.value"
        @retry="submitChange"
      />
      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="!codeFor || !validCode || change.busy.value"
          :aria-busy="change.busy.value || undefined"
        >
          {{ t('phone.confirm') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="change.busy.value || change.uncertain.value"
          @click="editing = false"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </form>
  </SheetDialog>

  <ConfirmDialog
    :open="removing"
    :title="t('phone.unbindTitle')"
    :message="t('phone.unbindWarning')"
    :confirm-label="t('phone.unbind')"
    :busy="unbind.busy.value"
    :uncertain="unbind.uncertain.value"
    :error="unbind.error.value === 'recent_authentication_required' ? '' : unbind.error.value"
    danger
    @confirm="submitUnbind"
    @retry="submitUnbind"
    @cancel="removing = false"
  />
</template>

<style scoped>
.phone-row { display: flex; gap: .5rem; }
.phone-row .input { flex: 1; min-width: 0; }
.phone-row .btn { flex: none; }
</style>
