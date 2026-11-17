<script setup lang="ts">
import { CircleAlert, LoaderCircle, MailCheck } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import ActionError from './ActionError.vue'
import type { EmailChallenge } from './api'

// The last step of school-email verification: show the real sending state, take the
// six-digit code, and offer resend or going back to choose another method. One real
// input holds the code, so pasting and one-time-code autofill work; the six cells
// above it only draw what was typed.
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
const focused = ref(false)
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
    class="stack email-step"
    aria-labelledby="verification-step-title"
  >
    <p
      class="email-status"
      :class="{ 'is-sent': sent, 'is-failed': failed }"
      role="status"
      aria-live="polite"
    >
      <span
        class="email-status-icon"
        aria-hidden="true"
      ><LoaderCircle
        v-if="sending"
        class="spin"
      /><MailCheck v-else-if="sent" /><CircleAlert v-else-if="failed" /></span>
      <span v-if="sending">{{ t('verification.emailStep.sending') }}</span>
      <span v-else-if="sent">{{ t('verification.emailStep.sent', { email: challenge.masked_email }) }}</span>
      <span v-else-if="failed">{{ t('verification.emailStep.failed') }}</span>
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
      <div
        class="code"
        :class="{ focused, off: busy || expired || failed }"
      >
        <span
          v-for="index in 6"
          :key="index"
          class="code-cell"
          :class="{ filled: code.length >= index, caret: focused && code.length === index - 1 }"
          aria-hidden="true"
        >{{ code[index - 1] ?? '' }}</span>
        <input
          id="email-code"
          ref="input"
          :value="code"
          class="code-input"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="32"
          :disabled="busy || expired || failed"
          :aria-describedby="'email-code-expiry'"
          required
          @input="onInput"
          @focus="focused = true"
          @blur="focused = false"
        >
      </div>
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
        <template v-if="sent && !expired">
          {{ t('verification.emailStep.spamHint') }}
        </template>
      </p>
      <ActionError :code="error" />
      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="submit"
          :disabled="busy || code.length !== 6 || expired || failed"
          :aria-busy="(busy && code.length === 6) || undefined"
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
.email-status { display: flex; align-items: center; gap: .75rem; margin: 0; padding: .75rem 1rem; border-radius: var(--radius); background: var(--fill); font-weight: 550; line-height: 1.4; transition: background-color .3s, color .3s; }
.email-status-icon { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--surface); }
.email-status svg { width: 1.125rem; height: 1.125rem; }
.email-status.is-sent { background: var(--success-soft); color: var(--success); }
.email-status.is-failed { background: var(--danger-soft); color: var(--danger); }
/* Digits always read left to right, also inside a right-to-left page. */
.code { position: relative; display: flex; gap: .5rem; justify-self: start; direction: ltr; }
.code-cell { display: grid; place-items: center; width: 46px; height: 56px; border-radius: 12px; background: var(--fill); font-family: var(--mono); font-size: 1.5rem; font-weight: 650; transition: box-shadow .15s, background-color .15s, transform .25s var(--spring); }
.code-cell.filled { background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--label-3); transform: scale(1.02); }
.code-cell.caret { background: var(--surface); box-shadow: inset 0 0 0 2px var(--accent-fill), 0 0 0 4px var(--accent-soft); }
.code-cell.caret::after { content: ""; width: 2px; height: 1.5rem; border-radius: 1px; background: var(--accent-fill); animation: caret 1.1s steps(1) infinite; }
.code.focused .code-cell.filled:last-of-type { box-shadow: inset 0 0 0 2px var(--accent-fill); }
.code.off { opacity: .5; }
/* The real field lies over the cells, invisible but focusable, so typing, pasting and autofill go to it. */
.code-input { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; color: transparent; caret-color: transparent; font-size: 1rem; letter-spacing: 2em; opacity: 0; cursor: text; }
.code-input:disabled { cursor: default; }
@keyframes caret { 50% { opacity: 0; } }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin, .code-cell.caret::after { animation: none; } }
@media (max-width: 400px) { .code { gap: .375rem; } .code-cell { width: 42px; height: 52px; } }
</style>
