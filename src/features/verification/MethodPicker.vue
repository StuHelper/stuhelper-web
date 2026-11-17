<script setup lang="ts">
import { Camera, IdCard, KeyRound, Mail, Send } from 'lucide-vue-next'
import { useId, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Kind, Method } from './api'

// Step one of verification: who you are, then how you want to prove it. Every method the
// school offers is shown as a card that says what it needs, so the choice is made with
// the options in view. A method the school does not offer to the chosen identity stays
// visible but cannot be chosen; the reason is said on the card. The server decides again.
defineProps<{ kinds: readonly Kind[]; kind: Kind; methods: readonly Method[]; method: Method; allowed: (method: Method) => boolean; disabled?: boolean }>()
defineEmits<{ kind: [kind: Kind]; method: [method: Method] }>()
const { t } = useI18n()
const group = useId()
const icons: Record<Method, Component> = {
  real_name_identity_check: IdCard,
  school_sso: KeyRound,
  student_email_outbound_otp: Mail,
  student_email_inbound_challenge: Send,
  manual_material_review: Camera,
}
</script>

<template>
  <div class="picker">
    <fieldset
      v-if="kinds.length"
      class="picker-group"
      :disabled="disabled"
    >
      <legend class="field-label">
        {{ t('verification.kind') }}
      </legend>
      <div class="kinds">
        <label
          v-for="item in kinds"
          :key="item"
          class="kind"
          :class="{ chosen: kind === item }"
        >
          <input
            type="radio"
            :name="`${group}-kind`"
            :value="item"
            :checked="kind === item"
            @change="$emit('kind', item)"
          >
          <span>{{ t(`verification.kinds.${item}`) }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset
      class="picker-group"
      :disabled="disabled"
    >
      <legend class="field-label">
        {{ t('verification.method') }}
      </legend>
      <div class="methods">
        <label
          v-for="item in methods"
          :key="item"
          class="method"
          :class="{ chosen: method === item, off: !allowed(item) }"
        >
          <input
            type="radio"
            :name="`${group}-method`"
            :value="item"
            :checked="method === item"
            :disabled="!allowed(item)"
            :aria-describedby="`${group}-${item}`"
            @change="$emit('method', item)"
          >
          <span
            class="method-icon"
            aria-hidden="true"
          ><component :is="icons[item]" /></span>
          <span class="method-copy">
            <b>{{ t(`verification.methods.${item}`) }}</b>
            <span
              :id="`${group}-${item}`"
              class="method-needs"
            >{{ allowed(item) ? t(`verification.needs.${item}`) : t('verification.picker.unavailable') }}</span>
          </span>
          <span
            class="method-mark"
            aria-hidden="true"
          />
        </label>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.picker { display: grid; gap: 1.125rem; }
.picker-group { display: grid; gap: .5rem; }
.picker-group legend { margin-block-end: .5rem; font-size: .8125rem; font-weight: 500; }
.kinds { display: flex; flex-wrap: wrap; gap: .375rem; }
.kind { position: relative; display: inline-flex; align-items: center; min-height: 38px; padding: .25rem 1rem; border-radius: var(--pill); background: var(--fill); font-size: .9375rem; cursor: pointer; transition: background-color .2s, color .2s, transform .3s var(--spring); }
.kind:hover { background: var(--fill-strong); }
.kind:active { transform: scale(.96); }
.kind.chosen { background: var(--label); color: var(--bg); font-weight: 550; }
.kind input, .method input { position: absolute; opacity: 0; pointer-events: none; }
.kind:focus-within, .method:focus-within { outline: 3px solid color-mix(in srgb, var(--accent-fill) 55%, transparent); outline-offset: 2px; }
.methods { display: grid; gap: .625rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); }
.method { position: relative; display: flex; align-items: flex-start; gap: .75rem; padding: .875rem 1rem; border-radius: var(--radius); background: var(--surface); box-shadow: inset 0 0 0 1px var(--separator); cursor: pointer; transition: box-shadow .2s, background-color .2s, transform .35s var(--spring); }
@media (hover: hover) { .method:not(.off):hover { box-shadow: inset 0 0 0 1px var(--label-3); } }
.method:not(.off):active { transform: scale(.985); }
.method.chosen { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill); }
.method-icon { flex: none; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: var(--fill); color: var(--label-2); transition: background-color .2s, color .2s; }
.method.chosen .method-icon { background: var(--accent-fill); color: var(--on-accent); }
.method-icon svg { width: 20px; height: 20px; }
.method-copy { display: grid; gap: .125rem; flex: 1; min-width: 0; line-height: 1.35; }
.method-copy b { font-weight: 600; }
.method-needs { color: var(--label-2); font-size: .8125rem; }
/* The mark shows the choice a second way, so it does not rest on colour alone. */
.method-mark { flex: none; width: 20px; height: 20px; margin-block-start: .125rem; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--label-3); transition: box-shadow .2s, background-color .2s; }
.method.chosen .method-mark { background: var(--accent-fill) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%23fff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 7.5 2.8 2.8L11 4.5'/%3E%3C/svg%3E") center / 13px no-repeat; box-shadow: none; }
.method.off { cursor: default; background: transparent; }
.method.off .method-icon, .method.off b { opacity: .5; }
.method.off .method-mark { visibility: hidden; }
fieldset:disabled .kind, fieldset:disabled .method { cursor: default; opacity: .6; }
@media (pointer: coarse) { .kind { min-height: 44px; } }
</style>
