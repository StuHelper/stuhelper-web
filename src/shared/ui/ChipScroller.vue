<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// A single row of filter chips that may be wider than the page. Touch screens swipe it;
// mouse users get arrow buttons, a vertical wheel that scrolls sideways, and edge fades
// that show more chips are hidden. The pressed chip is kept in view.
const props = defineProps<{ label: string; active?: string }>()
const { t } = useI18n()
const track = ref<HTMLElement>()
const start = ref(false)
const end = ref(false)

// scrollLeft is negative in right-to-left layouts, so distances use its absolute value.
function measure() {
  const el = track.value
  if (!el) return
  const offset = Math.abs(el.scrollLeft)
  start.value = offset > 2
  end.value = offset + el.clientWidth < el.scrollWidth - 2
}
function page(direction: 1 | -1) {
  const el = track.value
  if (!el) return
  const rtl = getComputedStyle(el).direction === 'rtl'
  el.scrollBy({ left: direction * (rtl ? -1 : 1) * el.clientWidth * 0.8, behavior: 'smooth' })
}
// Only a mostly vertical wheel is turned sideways, and only while the row can still move
// that way; at either end the page scrolls normally.
function wheel(event: WheelEvent) {
  const el = track.value
  if (!el || Math.abs(event.deltaY) <= Math.abs(event.deltaX) || el.scrollWidth <= el.clientWidth) return
  const rtl = getComputedStyle(el).direction === 'rtl'
  const forward = event.deltaY > 0
  if ((forward && end.value) || (!forward && start.value)) {
    event.preventDefault()
    el.scrollBy({ left: event.deltaY * (rtl ? -1 : 1) })
  }
}
// Only the row itself scrolls; scrollIntoView could also move the page.
function reveal() {
  const el = track.value
  const pressed = el?.querySelector<HTMLElement>('[aria-pressed="true"]')
  if (!el || !pressed) return
  const row = el.getBoundingClientRect(), chip = pressed.getBoundingClientRect()
  const margin = 40
  if (chip.left >= row.left + margin && chip.right <= row.right - margin) return
  el.scrollBy({ left: chip.left - row.left - (row.width - chip.width) / 2, behavior: 'smooth' })
}

// A fixed-width row does not resize when chips arrive later (categories load after the page),
// so added or changed chips are measured too.
let resized: ResizeObserver | undefined
let changed: MutationObserver | undefined
onMounted(() => {
  measure()
  reveal()
  const el = track.value
  if (!el) return
  if (typeof ResizeObserver !== 'undefined') {
    resized = new ResizeObserver(measure)
    resized.observe(el)
  }
  if (typeof MutationObserver !== 'undefined') {
    changed = new MutationObserver((records) => {
      measure()
      // New chips may push the pressed one out of view; count updates alone do not move the row.
      if (records.some((record) => record.type === 'childList' && record.target === el)) reveal()
    })
    changed.observe(el, { childList: true, subtree: true, characterData: true })
  }
})
onBeforeUnmount(() => { resized?.disconnect(); changed?.disconnect() })
watch(() => props.active, () => void nextTick(reveal))
</script>

<template>
  <div
    class="chip-scroller"
    :class="{ 'fade-start': start, 'fade-end': end }"
  >
    <button
      v-show="start"
      class="chip-arrow chip-arrow-start"
      type="button"
      :aria-label="t('common.scrollBack')"
      @click="page(-1)"
    >
      <ChevronLeft aria-hidden="true" />
    </button>
    <div
      ref="track"
      class="d-chips"
      role="group"
      :aria-label="label"
      @scroll.passive="measure"
      @wheel="wheel"
    >
      <slot />
    </div>
    <button
      v-show="end"
      class="chip-arrow chip-arrow-end"
      type="button"
      :aria-label="t('common.scrollForward')"
      @click="page(1)"
    >
      <ChevronRight aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.chip-scroller { position: relative; min-width: 0; }
.chip-scroller .d-chips { scroll-padding-inline: 2.5rem; }
.chip-scroller.fade-start .d-chips { mask-image: linear-gradient(to var(--chip-start-side), transparent, #000 3rem); }
.chip-scroller.fade-end .d-chips { mask-image: linear-gradient(to var(--chip-end-side), transparent, #000 3rem); }
.chip-scroller.fade-start.fade-end .d-chips { mask-image: linear-gradient(to var(--chip-end-side), transparent, #000 3rem, #000 calc(100% - 3rem), transparent); }
.chip-scroller { --chip-start-side: right; --chip-end-side: left; }
.chip-scroller:dir(rtl) { --chip-start-side: left; --chip-end-side: right; }
.chip-arrow { position: absolute; inset-block: 0; z-index: 1; display: none; place-items: center; width: 2rem; margin-block: auto; height: 2rem; padding: 0; border: 0; border-radius: 50%; background: var(--surface); box-shadow: var(--shadow-card); color: var(--label); cursor: pointer; }
.chip-arrow:hover { background: var(--fill-strong); }
.chip-arrow svg { width: 1.125rem; height: 1.125rem; }
.chip-arrow:dir(rtl) svg { transform: scaleX(-1); }
.chip-arrow-start { inset-inline-start: 0; }
.chip-arrow-end { inset-inline-end: 0; }
/* Arrows only help a mouse; touch screens swipe the row. */
@media (hover: hover) and (pointer: fine) { .chip-arrow { display: grid; } }
</style>
