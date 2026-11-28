<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isolate } from '../../shared/format'
import type { EmailTransferStatus } from './api'

defineProps<{ document: EmailTransferStatus['document'] }>()
const { t } = useI18n()
const facts = ['recipient', 'data', 'purpose', 'place', 'period', 'rights'] as const
</script>

<template>
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
      :href="document.url"
      target="_blank"
      rel="noopener"
    >{{ t('verification.transfer.read', { version: isolate(document.version) }) }}</a>
  </p>
</template>

<style scoped>
.transfer-facts { display: grid; gap: .5rem; }
.transfer-facts dt { font-weight: 600; }
.transfer-facts dd { margin: 0; }
</style>
