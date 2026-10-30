<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAsync } from '../../shared/composables/async'
import { useHttp } from '../../shared/session'
import { getCapabilities } from './api'

// The only live status region on the home page: the platform answers or not.
const { t, te } = useI18n()
const http = useHttp()
const capabilities = useAsync((signal) => getCapabilities(http, signal))
const message = computed(() => {
  if (capabilities.status.value === 'ready') return t('connection.ready')
  if (capabilities.status.value === 'error') {
    const key = `connection.errors.${capabilities.error.value}`
    return te(key) ? t(key) : t('connection.errors.unavailable')
  }
  return t('connection.loading')
})
onMounted(capabilities.reload)
</script>

<template>
  <section
    class="connection"
    :class="`connection-${capabilities.status.value}`"
    :aria-label="t('connection.label')"
    :aria-busy="capabilities.status.value === 'loading'"
  >
    <p
      class="connection-copy"
      role="status"
      aria-live="polite"
    >
      <span
        class="connection-dot"
        aria-hidden="true"
      />
      <span>{{ message }}</span>
    </p>
    <button
      v-if="capabilities.status.value === 'error'"
      class="btn btn-sm"
      type="button"
      @click="capabilities.reload"
    >
      {{ t('connection.retry') }}
    </button>
  </section>
</template>

<style scoped>
.connection { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: .5rem 1rem; }
.connection-copy { display: flex; align-items: center; gap: .5rem; color: var(--label-2); font-size: .875rem; }
.connection-dot { flex: 0 0 8px; height: 8px; border-radius: 50%; background: var(--label-3); }
.connection-ready .connection-dot { background: #34c759; box-shadow: 0 0 0 3px rgb(52 199 89 / 22%); }
.connection-error .connection-dot { background: #ff9500; box-shadow: 0 0 0 3px rgb(255 149 0 / 22%); }
.connection-loading .connection-dot { animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .35; } }
</style>
