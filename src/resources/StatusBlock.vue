<script setup lang="ts">
import { useI18n } from 'vue-i18n';
defineProps<{ busy?: boolean; error?: string; empty?: boolean }>();
defineEmits<{ retry: [] }>();
const { t } = useI18n();
</script>
<template>
  <p
    v-if="busy"
    role="status"
  >
    {{ t('resources.loading') }}
  </p>
  <div
    v-else-if="error"
    role="alert"
  >
    <p>{{ t(`resources.errors.${error}`) }}</p>
    <button @click="$emit('retry')">
      {{ t('resources.retry') }}
    </button>
  </div>
  <p
    v-else-if="empty"
    role="status"
  >
    {{ t('resources.empty') }}
  </p>
</template>
