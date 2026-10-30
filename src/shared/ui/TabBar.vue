<script setup lang="ts" generic="T extends string">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// Segmented control following the WAI-ARIA tabs pattern with automatic
// activation. The thumb is measured so it can slide between labels of any length.
const props = defineProps<{ tabs: { value: T; label: string }[]; label: string; idPrefix: string }>()
const model = defineModel<T>({ required: true })
const root = ref<HTMLElement>()
const buttons = ref<HTMLButtonElement[]>([])
const thumb = ref({ width: 0, offset: 0 })
let observer: ResizeObserver | undefined

function measure() {
  const index = props.tabs.findIndex((tab) => tab.value === model.value)
  const button = buttons.value[index]
  if (!button || !root.value) return
  thumb.value = { width: button.offsetWidth, offset: button.offsetLeft }
  // Keep the selected tab visible by scrolling the bar only, never the page.
  const bar = root.value.getBoundingClientRect()
  const box = button.getBoundingClientRect()
  if (box.left < bar.left) root.value.scrollLeft -= bar.left - box.left
  else if (box.right > bar.right) root.value.scrollLeft += box.right - bar.right
}

function move(event: KeyboardEvent, index: number) {
  const count = props.tabs.length
  const rtl = document.documentElement.dir === 'rtl'
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
  let next = -1
  if (event.key === forward) next = (index + 1) % count
  else if (event.key === backward) next = (index - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next < 0) return
  event.preventDefault()
  const tab = props.tabs[next]
  if (tab) model.value = tab.value
  buttons.value[next]?.focus()
}

watch([model, () => props.tabs], () => void nextTick(measure))
onMounted(() => {
  measure()
  observer = new ResizeObserver(measure)
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    ref="root"
    class="tabs"
    role="tablist"
    :aria-label="label"
  >
    <span
      class="tab-thumb"
      aria-hidden="true"
      :style="{ width: `${thumb.width}px`, insetInlineStart: 'auto', left: 0, transform: `translateX(${thumb.offset}px)` }"
    />
    <button
      v-for="(tab, index) in tabs"
      :id="`${idPrefix}-tab-${tab.value}`"
      :key="tab.value"
      ref="buttons"
      class="tab"
      role="tab"
      type="button"
      :aria-selected="model === tab.value"
      :aria-controls="`${idPrefix}-panel`"
      :tabindex="model === tab.value ? 0 : -1"
      @click="model = tab.value"
      @keydown="move($event, index)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
