<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { dismiss, toasts, type Toast } from './toast'

const { t } = useI18n()
function undo(row: Toast) {
  row.undo?.()
  dismiss(row.id)
}
</script>

<template>
  <div
    class="toasts"
    aria-live="polite"
  >
    <div
      v-for="row in toasts"
      :key="row.id"
      class="toast"
    >
      <span>{{ row.text }}</span>
      <button
        v-if="row.undo"
        class="btn btn-sm"
        type="button"
        @click="undo(row)"
      >
        {{ t('common.undo') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.toasts { position: fixed; inset-block-end: calc(var(--tab-height) + var(--safe-bottom) + 1rem); inset-inline: 0; z-index: 90; display: grid; justify-items: center; gap: .5rem; pointer-events: none; }
.toast { pointer-events: auto; display: flex; align-items: center; gap: .75rem; padding: .625rem 1.125rem; border-radius: var(--pill); background: var(--glass); box-shadow: var(--glass-edge), var(--shadow-float); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter); font-size: .9375rem; font-weight: 500; animation: toast-in .42s var(--ease-out); }
.toast .btn { min-height: 28px; padding-block: .125rem; }
@keyframes toast-in { from { opacity: 0; transform: translateY(12px) scale(.96); } }
@media (min-width: 761px) { .toasts { inset-block-end: 1.5rem; } }
@media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
</style>
