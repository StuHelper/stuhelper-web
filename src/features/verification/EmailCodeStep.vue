<script setup lang="ts">
import { CircleAlert, LoaderCircle, MailCheck } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import ActionError from './ActionError.vue'
import type { EmailChallenge } from './api'

// Step 2 of school-email verification: show the real sending state, take the
// six-digit code, and offer resend or going back to choose another method.
const props = defineProps<{ challenge: EmailChallenge; sentAt: number; busy: boolean; error: string }>()
const code = defineModel<string>('code', { required: true })
const emit = defineEmits<{ confirm: []; resend: []; back: [] }>()
const { t } = useI18n()
const format = useFormat()

// Matches the server rule: one new code per application per minute.
const RESEND_SECONDS = 60
const now = ref(Date.now())
const clock = setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => clearInterval(clock))

const sending = computed(() => props.challenge.state === 'queued')
const sent = computed(() => props.challenge.state === 'delivered' || props.challenge.state === 'waiting')
const failed = computed(() => props.challenge.state === 'failed')
const expired = computed(() => now.value >= Date.parse(props.challenge.expires_at))
const remaining = computed(() => Math.max(0, Math.ceil((Date.parse(props.challenge.expires_at) - now.value) / 1000)))
const resendIn = computed(() => (props.sentAt ? Math.max(0, RESEND_SECONDS - Math.floor((now.value - props.sentAt) / 1000)) : 0))
const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

const input = ref<HTMLInputElement>()
watch(sent, (value) => { if (value) void nextTick(() => input.value?.focus()) }, { immediate: true })

function onInput(event: Event) {
  // Keep digits only, so pasted text such as "482 916" still works.
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const digits = target.value.replace(/\D/g, '').slice(0, 6)
  const changed = digits !== code.value
  target.value = digits
  code.value = digits
  if (changed && digits.length === 6 && !props.busy && !expired.value && !failed.value) emit('confirm')
}
</script>

<template>
  <section
    class="card stack email-step"
    aria-labelledby="email-step-title"
  >
    <h2 id="email-step-title">
      {{ t('verification.emailStep.title') }}
    </h2>

    <p
      class="email-status"
      :class="{ 'is-sent': sent, 'is-failed': failed }"
      role="status"
      aria-live="polite"
    >
      <LoaderCircle
        v-if="sending"
        class="spin"
        aria-hidden="true"
      />
      <MailCheck
        v-else-if="sent"
        aria-hidden="true"
      />
      <CircleAlert
        v-else-if="failed"
        aria-hidden="true"
      />
      <span v-if="sending">{{ t('verification.emailStep.sending') }}</span>
      <span v-else-if="sent">{{ t('verification.emailStep.sent', { email: challenge.masked_email }) }}</span>
      <span v-else-if="failed">{{ t('verification.emailStep.failed') }}</span>
    </p>
    <p
      v-if="sent"
      class="small muted"
    >
      {{ t('verification.emailStep.spamHint') }}
    </p>

    <form
      class="stack-sm"
      @submit.prevent="emit('confirm')"
    >
      <label
        class="field"
        for="email-code"
      >
        <span class="field-label">{{ t('verification.emailCode') }}</span>
      </label>
      <input
        id="email-code"
        ref="input"
        :value="code"
        class="input code-input"
        inputmode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]{6}"
        maxlength="32"
        :disabled="busy || expired || failed"
        :aria-describedby="'email-code-expiry'"
        required
        @input="onInput"
      >
      <p
        id="email-code-expiry"
        class="small muted"
      >
        <template v-if="expired">
          {{ t('verification.emailStep.expired') }}
        </template>
        <template v-else>
          {{ t('verification.emailStep.validFor', { time: clockText(remaining), until: format.dateTime(challenge.expires_at) }) }}
        </template>
      </p>
      <ActionError :code="error" />
      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="busy || code.length !== 6 || expired || failed"
        >
          {{ t('verification.emailStep.confirm') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="busy || resendIn > 0"
          @click="emit('resend')"
        >
          {{ resendIn > 0 ? t('verification.emailStep.resendIn', { seconds: format.number(resendIn) }) : t('verification.emailStep.resend') }}
        </button>
        <button
          class="btn btn-ghost"
          type="button"
          :disabled="busy"
          @click="emit('back')"
        >
          {{ t('verification.back') }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.email-status { display: flex; align-items: center; gap: .5rem; margin: 0; font-weight: 600; }
.email-status svg { flex: none; width: 1.25rem; height: 1.25rem; }
.email-status.is-sent { color: var(--success, #12805c); }
.email-status.is-failed { color: var(--danger, #c4321c); }
.code-input {
  max-inline-size: 16rem;
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: .5em;
  text-align: center;
  padding-inline-start: .5em;
}
.code-input::placeholder { letter-spacing: .5em; opacity: .35; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
