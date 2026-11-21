<script setup lang="ts">
import { ShieldCheck, TimerReset } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// The two waits of an identity check. While the server checks, a short progress shows that the
// fixed wait is expected; after repeated failures, a countdown shows when the next try opens.
const props = defineProps<{ checking: boolean; remaining: number }>()
const { t } = useI18n()
const clock = computed(() => {
  const seconds = Math.max(0, props.remaining)
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
})
</script>

<template>
  <div
    v-if="checking"
    class="gate gate-checking"
    role="status"
  >
    <ShieldCheck aria-hidden="true" />
    <span class="gate-copy">{{ t('verification.checking') }}</span>
    <span
      class="gate-bar"
      aria-hidden="true"
    ><span /></span>
  </div>
  <div
    v-else-if="remaining > 0"
    class="gate gate-cooldown"
    role="status"
  >
    <TimerReset aria-hidden="true" />
    <span class="gate-copy">{{ t('verification.cooldown', { time: clock }) }}</span>
  </div>
</template>

<style scoped>
.gate { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: .375rem .625rem; padding: .75rem .875rem; border-radius: var(--radius); font-size: .9375rem; }
.gate svg { width: 1.125rem; height: 1.125rem; }
.gate-checking { background: var(--accent-soft); color: var(--accent); }
.gate-cooldown { background: var(--warning-soft); color: var(--warning); font-variant-numeric: tabular-nums; }
.gate-copy { color: var(--label); }
.gate-bar { grid-column: 1 / -1; height: 4px; overflow: hidden; border-radius: var(--pill); background: color-mix(in srgb, var(--accent) 18%, transparent); }
/* Fills most of the way over the server's fixed wait, then waits for the answer. */
.gate-bar span { display: block; width: 90%; height: 100%; border-radius: inherit; background: var(--accent); transform-origin: left; animation: fill 2.5s cubic-bezier(.3, .7, .4, 1) both; }
.gate-bar span:dir(rtl) { transform-origin: right; }
@keyframes fill { from { transform: scaleX(.04); } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) { .gate-bar span { animation: none; } }
</style>
