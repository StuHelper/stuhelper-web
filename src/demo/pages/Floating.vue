<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { UserCog, X } from 'lucide-vue-next'
import { persona, setPersona, type Persona } from '../server'
import { toasts } from '../store'
const { t: tr } = useI18n()
const open = ref(false)
const current = persona()
const options = computed<{ value: Persona; label: string; hint: string }[]>(() => [
  { value: 'verified', label: tr('demo.personaVerified'), hint: tr('demo.personaVerifiedHint') },
  { value: 'guest', label: tr('demo.personaGuest'), hint: tr('demo.personaGuestHint') },
  { value: 'unverified', label: tr('demo.personaUnverified'), hint: tr('demo.personaUnverifiedHint') },
  { value: 'processing', label: tr('demo.personaProcessing'), hint: tr('demo.personaProcessingHint') },
  { value: 'expired', label: tr('demo.personaExpired'), hint: tr('demo.personaExpiredHint') },
])
function pick(value: Persona) { setPersona(value); window.location.reload() }
</script>
<template>
  <div class="d-toasts" aria-live="polite"><div v-for="row in toasts" :key="row.id" class="d-toast"><span>{{ row.text }}</span><button v-if="row.undo" class="btn btn-sm" type="button" @click="row.undo(); toasts = toasts.filter((item) => item.id !== row.id)">{{ tr('demo.undo') }}</button></div></div>
  <div class="switcher">
    <div v-if="open" class="panel" role="dialog" :aria-label="tr('demo.switchPersona')">
      <p class="caption">{{ tr('demo.personaCaption') }}</p>
      <button v-for="row in options" :key="row.value" type="button" class="opt" :aria-pressed="row.value === current" @click="pick(row.value)">
        <b>{{ row.label }}</b><span>{{ row.hint }}</span>
      </button>
    </div>
    <button type="button" class="fab" :aria-label="open ? tr('demo.closePersona') : tr('demo.switchPersona')" :aria-expanded="open" @click="open = !open">
      <X v-if="open" aria-hidden="true" /><UserCog v-else aria-hidden="true" />
    </button>
  </div>
</template>
<style scoped>
.switcher { view-transition-name: demo-switcher; position: fixed; inset-block-end: 1.25rem; inset-inline-end: 1.25rem; z-index: 80; display: grid; justify-items: end; gap: .5rem; }
@media (max-width: 760px) { .switcher { inset-block-end: calc(var(--tab-height) + var(--safe-bottom) + .75rem); inset-inline-end: .75rem; } }
.fab { display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 50%; background: var(--glass); color: var(--label); box-shadow: var(--shadow-float), inset 0 0 0 .5px var(--separator); backdrop-filter: blur(20px); cursor: pointer; }
.fab svg { width: 20px; height: 20px; }
.panel { display: grid; gap: 2px; width: 15rem; padding: .625rem; border-radius: var(--radius); background: var(--surface-raised); box-shadow: var(--shadow-float); animation: menu-in .24s var(--ease-out); }
.panel .caption { padding: .25rem .5rem .375rem; }
.opt { display: grid; gap: 1px; padding: .4375rem .5rem; border: 0; border-radius: 8px; background: transparent; color: var(--label); font: inherit; text-align: start; cursor: pointer; }
.opt:hover { background: var(--fill); }
.opt[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
.opt b { font-size: .875rem; font-weight: 550; }
.opt span { color: var(--label-3); font-size: .75rem; }
</style>
