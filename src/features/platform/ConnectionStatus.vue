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
.connection { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1rem; }
.connection-copy { display: flex; align-items: center; gap: .55rem; color: var(--muted); font-size: .88rem; }
.connection-dot { flex: 0 0 8px; height: 8px; border-radius: 50%; background: var(--subtle); }
.connection-ready .connection-dot { background: var(--success); }
.connection-error .connection-dot { background: var(--warning); }
</style>
