<script setup lang="ts" generic="T extends string">
import { ref } from 'vue'

// Tabs with arrow-key navigation (WAI-ARIA tabs pattern, automatic activation).
const props = defineProps<{ tabs: { value: T; label: string }[]; label: string; idPrefix: string }>()
const model = defineModel<T>({ required: true })
const buttons = ref<HTMLButtonElement[]>([])

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
</script>

<template>
  <div
    class="tabs"
    role="tablist"
    :aria-label="label"
  >
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
