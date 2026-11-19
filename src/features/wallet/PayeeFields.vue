<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Payee } from './api'

defineProps<{ disabled: boolean }>()
const payee = defineModel<Payee>({ required: true })
const { t } = useI18n()
const limits = { method: 64, name: 256, account: 512 } as const
</script>

<template>
  <fieldset
    class="stack"
    :disabled="disabled"
  >
    <legend>{{ t('wallet.payee.title') }}</legend>
    <label
      v-for="(limit, field) in limits"
      :key="field"
      class="field"
    >
      <span class="field-label">{{ t(`wallet.payee.${field}`) }}</span>
      <input
        v-model.trim="payee[field]"
        class="input"
        required
        :maxlength="limit"
        autocomplete="off"
      >
    </label>
  </fieldset>
</template>
