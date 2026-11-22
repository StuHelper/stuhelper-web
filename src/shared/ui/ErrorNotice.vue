<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useErrorText } from './messages'

withDefaults(defineProps<{ code: string; retryable?: boolean; retryLabel?: string; notFoundRetryMessage?: string }>(), { retryable: true, retryLabel: '', notFoundRetryMessage: '' })
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const errorText = useErrorText()
</script>

<template>
  <div
    class="notice notice-error"
    role="alert"
  >
    <span>{{ code === 'not_found' && notFoundRetryMessage ? notFoundRetryMessage : errorText(code) }}</span>
    <RouterLink
      v-if="code === 'not_found'"
      class="btn btn-sm"
      to="/campus"
    >
      {{ t('common.goHome') }}
    </RouterLink>
    <button
      v-if="retryable && (code !== 'not_found' || notFoundRetryMessage)"
      class="btn btn-sm"
      type="button"
      @click="emit('retry')"
    >
      {{ retryLabel || t('common.retry') }}
    </button>
  </div>
</template>
