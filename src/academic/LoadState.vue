<script setup lang="ts">
import { useI18n } from 'vue-i18n'
defineProps<{ busy?: boolean; error?: string; empty?: boolean }>()
defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>
<template>
  <p
    v-if="busy"
    role="status"
  >
    {{ t('academic.loading') }}
  </p>
  <div
    v-else-if="error"
    role="alert"
    class="academic-alert"
  >
    <p>{{ t(`academic.errors.${error}`) }}</p><button
      type="button"
      @click="$emit('retry')"
    >
      {{ t('academic.retry') }}
    </button>
  </div>
  <p v-else-if="empty">
    {{ t('academic.empty') }}
  </p>
</template>
