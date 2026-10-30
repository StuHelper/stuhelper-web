<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { LoadStatus } from '../composables/async'
import ErrorNotice from './ErrorNotice.vue'

withDefaults(defineProps<{ status: LoadStatus; error?: string; empty?: boolean; emptyText?: string; retryLabel?: string }>(), { error: '', empty: false, emptyText: '', retryLabel: '' })
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div
    v-if="status === 'loading'"
    class="skeleton"
    :aria-busy="true"
  >
    <span class="visually-hidden">{{ t('common.loading') }}</span>
    <span aria-hidden="true" />
    <span aria-hidden="true" />
    <span aria-hidden="true" />
  </div>
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
