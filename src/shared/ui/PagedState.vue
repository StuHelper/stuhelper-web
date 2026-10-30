<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { LoadStatus } from '../composables/async'
import AsyncState from './AsyncState.vue'
import ErrorNotice from './ErrorNotice.vue'

// States of a cursor-paged list. Rows already shown stay visible while the next
// page loads or after it fails.
withDefaults(defineProps<{ status: LoadStatus; error: string; count: number; next: string; appending: boolean; emptyText?: string; retryLabel?: string }>(), { emptyText: '', retryLabel: '' })
const emit = defineEmits<{ retry: []; more: [] }>()
const { t } = useI18n()
</script>

<template>
  <AsyncState
    v-if="count === 0"
    :status="status"
    :error="error"
    :empty="true"
    :empty-text="emptyText"
    :retry-label="retryLabel"
    @retry="emit('retry')"
  >
    <template #empty>
      <slot name="empty">
        <p class="empty">
          {{ emptyText || t('common.empty') }}
        </p>
      </slot>
    </template>
  </AsyncState>
  <template v-else>
    <slot />
    <ErrorNotice
      v-if="status === 'error'"
      :code="error"
      @retry="emit('more')"
    />
    <div
      v-else-if="next"
      class="paged-more"
    >
      <button
        class="btn"
        type="button"
        :disabled="appending"
        @click="emit('more')"
      >
        {{ appending ? t('common.loading') : t('common.loadMore') }}
      </button>
    </div>
  </template>
</template>

<style scoped>
.paged-more { display: flex; justify-content: center; }
</style>
