<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useErrorText } from './messages'

// Shows the outcome of a write. An unknown outcome offers only a retry of the
// original request, never a fresh submission.
defineProps<{ busy: boolean; error: string; uncertain: boolean; success?: string }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const errorText = useErrorText()
</script>

<template>
  <div
    v-if="uncertain"
    class="notice notice-warning"
    role="alert"
  >
    <span>{{ t('common.uncertain') }}</span>
    <button
      class="btn btn-sm"
      type="button"
      :disabled="busy"
      @click="emit('retry')"
    >
      {{ t('common.retryOriginal') }}
    </button>
  </div>
  <p
    v-else-if="error"
    class="notice notice-error"
    role="alert"
  >
    {{ errorText(error) }}
  </p>
  <p
    v-else-if="success && !busy"
    class="notice notice-success"
    role="status"
  >
    {{ success }}
  </p>
</template>
