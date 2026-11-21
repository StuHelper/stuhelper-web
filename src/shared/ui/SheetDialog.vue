<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

// Modal surface for confirmations and short forms. Reka keeps focus inside and
// returns it to the opener. Closing goes through `close` so that a page can
// refuse while a write is in flight.
const props = withDefaults(defineProps<{ open: boolean; title: string; description?: string; wide?: boolean }>(), { description: '', wide: false })
const { t } = useI18n()
let opener: HTMLElement | undefined
watch(() => props.open, open => {
  if (open && document.activeElement instanceof HTMLElement) opener = document.activeElement
}, { immediate: true, flush: 'sync' })
function restoreFocus(event: Event) {
  if (opener?.isConnected) {
    event.preventDefault()
    opener.focus({ preventScroll: true })
  }
}
const emit = defineEmits<{ close: [] }>()

// The sheet stays visible for a short closing animation after `open` turns
// false. Pages usually clear the state the sheet shows (the chosen item or
// scope) at the same moment, and child components re-render on their own, so
// the live content would flash empty or default text. Just before Vue applies
// the closing update, a copy of the current DOM is taken. The live content is
// hidden and the copy is shown until the sheet leaves the page. The copy is
// inert and is dropped as soon as the sheet opens again.
const live = ref<HTMLElement>()
const still = ref<HTMLElement>()
const closing = ref(false)
watch(() => props.open, open => {
  if (open) {
    closing.value = false
    return
  }
  const copy = live.value?.cloneNode(true)
  if (!(copy instanceof HTMLElement)) return
  closing.value = true
  void nextTick(() => {
    if (!closing.value || !still.value) return
    still.value.replaceChildren(...copy.childNodes)
  })
}, { flush: 'sync' })
</script>

<template>
  <DialogRoot
    :open="open"
    @update:open="(next) => { if (!next) emit('close') }"
  >
    <DialogPortal>
      <DialogOverlay class="sheet-overlay" />
      <DialogContent
        class="sheet"
        :class="{ 'sheet-wide': wide }"
        v-bind="description ? {} : { 'aria-describedby': undefined }"
        :inert="!open || undefined"
        @close-auto-focus="restoreFocus"
      >
        <div
          v-if="closing"
          ref="still"
          class="sheet-body"
          aria-hidden="true"
        />
        <div
          v-show="!closing"
          ref="live"
          class="sheet-body"
        >
          <span
            class="sheet-grabber"
            aria-hidden="true"
          />
          <div class="row-between">
            <DialogTitle class="sheet-title">
              {{ title }}
            </DialogTitle>
            <button
              class="btn btn-icon"
              type="button"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <DialogDescription
            v-if="description"
            class="small muted"
          >
            {{ description }}
          </DialogDescription>
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
