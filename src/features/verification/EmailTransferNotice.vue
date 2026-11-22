<script setup lang="ts">
import { Globe2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { isolate } from '../../shared/format'
import type { EmailTransferStatus } from './api'

// The separate notice shown before the first outbound school-email code. The full text is
// the fixed publication behind `status.document.url`; this card names what leaves the
// country and why. Only the "agree and send" button counts as the choice.
defineProps<{ status: EmailTransferStatus; changed: boolean; busy: boolean; canAgree: boolean }>()
const emit = defineEmits<{ agree: []; back: [] }>()
const { t } = useI18n()
const facts = ['recipient', 'data', 'purpose', 'place', 'period', 'rights'] as const
</script>

<template>
  <section
    class="notice notice-info stack"
    aria-labelledby="email-transfer-title"
  >
    <h3
      id="email-transfer-title"
      class="transfer-title"
    >
      <Globe2 aria-hidden="true" />{{ t('verification.transfer.title') }}
    </h3>
    <p
      v-if="changed"
      class="notice notice-warning"
      role="alert"
    >
      {{ t('verification.transfer.changed') }}
    </p>
    <p>{{ t('verification.transfer.intro') }}</p>
    <dl class="transfer-facts">
      <div
        v-for="fact in facts"
        :key="fact"
      >
        <dt>{{ t(`verification.transfer.facts.${fact}.label`) }}</dt>
        <dd>{{ t(`verification.transfer.facts.${fact}.text`) }}</dd>
      </div>
    </dl>
    <p class="small">
      <a
        :href="status.document.url"
        target="_blank"
        rel="noopener"
      >{{ t('verification.transfer.read', { version: isolate(status.document.version) }) }}</a>
    </p>
    <p class="subtle small">
      {{ t('verification.transfer.other') }}
    </p>
    <div class="form-actions">
      <button
        class="btn btn-primary"
        type="button"
        :disabled="busy || !canAgree"
        :aria-busy="busy || undefined"
        @click="emit('agree')"
      >
        {{ t('verification.transfer.agree') }}
      </button>
      <button
        class="btn btn-ghost"
        type="button"
        :disabled="busy"
        @click="emit('back')"
      >
        {{ t('verification.transfer.back') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.transfer-title { display: flex; align-items: center; gap: .5rem; font-size: 1.0625rem; font-weight: 620; }
.transfer-title svg { width: 20px; height: 20px; }
.transfer-facts { display: grid; gap: .5rem; }
.transfer-facts dt { font-weight: 600; }
.transfer-facts dd { margin: 0; }
</style>
