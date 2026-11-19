<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCapabilities } from '../../shared/capabilities'

// Tells visitors when the platform does not answer. A working connection needs no message.
const { t, te } = useI18n()
const capabilities = useCapabilities()
const message = computed(() => {
  const key = `connection.errors.${capabilities.failure.value}`
  return te(key) ? t(key) : t('connection.errors.unavailable')
})
</script>

<template>
  <section
    v-if="capabilities.status.value === 'error'"
    class="connection"
    :aria-label="t('connection.label')"
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
      class="btn btn-sm"
      type="button"
      @click="capabilities.load"
    >
      {{ t('connection.retry') }}
    </button>
  </section>
</template>

<style scoped>
.connection { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: .5rem 1rem; }
.connection-copy { display: flex; align-items: center; gap: .5rem; color: var(--label-2); font-size: .875rem; }
.connection-dot { flex: 0 0 8px; height: 8px; border-radius: 50%; background: var(--c-orange); box-shadow: 0 0 0 3px rgb(255 149 0 / 22%); }
</style>
