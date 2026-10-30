<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useErrorText } from './messages'

withDefaults(defineProps<{ code: string; retryable?: boolean; retryLabel?: string }>(), { retryable: true, retryLabel: '' })
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const errorText = useErrorText()
</script>

<template>
  <div
    class="notice notice-error"
    role="alert"
  >
    <span>{{ errorText(code) }}</span>
    <button
      v-if="retryable"
      class="btn btn-sm"
      type="button"
      @click="emit('retry')"
    >
      {{ retryLabel || t('common.retry') }}
    </button>
  </div>
</template>
