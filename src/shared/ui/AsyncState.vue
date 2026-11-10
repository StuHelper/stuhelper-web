<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { LoadStatus } from '../composables/async'
import ErrorNotice from './ErrorNotice.vue'
import PageSkeleton from './PageSkeleton.vue'

withDefaults(defineProps<{ status: LoadStatus; skeleton?: 'list' | 'detail' | 'bands'; error?: string; empty?: boolean; emptyText?: string; retryLabel?: string }>(), { skeleton: 'list', error: '', empty: false, emptyText: '', retryLabel: '' })
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <PageSkeleton
    v-if="status === 'loading'"
    :variant="skeleton"
  />
  <ErrorNotice
    v-else-if="status === 'error'"
    :code="error"
    :retry-label="retryLabel"
    @retry="emit('retry')"
  />
  <template v-else-if="status === 'ready'">
    <slot
      v-if="empty"
      name="empty"
    >
      <p class="empty">
        {{ emptyText || t('common.empty') }}
      </p>
    </slot>
    <slot v-else />
  </template>
</template>
