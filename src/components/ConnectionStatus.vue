<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PlatformError } from '../api/client'

const props = defineProps<{ state: 'loading' | 'ready' | 'error'; error: PlatformError['code'] | null; admin: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const errorKeys = {
  network: 'connection.errors.network', incompatible: 'connection.errors.incompatible',
  identity: 'connection.errors.identity', unauthenticated: 'connection.errors.unauthenticated',
  forbidden: 'connection.errors.forbidden', unavailable: 'connection.errors.unavailable',
} as const
const message = computed(() => {
  if (props.state === 'loading') return t('connection.loading')
  if (props.state === 'ready') return props.admin ? t('connection.adminReady') : t('connection.ready')
  return t(errorKeys[props.error ?? 'unavailable'])
})
</script>

<template>
  <section
    class="connection"
    :class="`connection-${state}`"
    :aria-label="t('connection.label')"
    :aria-busy="state === 'loading'"
  >
    <div
      class="connection-copy"
      role="status"
      aria-live="polite"
    >
      <span
        class="status-dot"
        aria-hidden="true"
      />
      <span>{{ message }}</span>
    </div>
    <button
      v-if="state === 'error'"
      class="retry-button"
      type="button"
      @click="emit('retry')"
    >
      {{ t('connection.retry') }}
    </button>
  </section>
</template>

<style scoped>
.connection { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.2rem; background: var(--surface); }
.connection-copy { display: flex; align-items: center; gap: .7rem; color: var(--muted); font-size: .9rem; line-height: 1.6; }
.status-dot { display: block; flex: 0 0 7px; height: 7px; border-radius: 50%; background: #7b8490; }
.connection-ready .status-dot { background: #2b795c; }
.connection-error .status-dot { background: #aa6d27; }
.retry-button { flex-shrink: 0; min-height: 40px; border: 1px solid var(--border); background: var(--surface); color: var(--accent); border-radius: 5px; padding: .4rem .7rem; cursor: pointer; font: inherit; font-size: .8rem; }
.retry-button:hover { background: var(--accent-soft); }
@media (max-width: 480px) { .connection { align-items: flex-start; flex-direction: column; } }
</style>
