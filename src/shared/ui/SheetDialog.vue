<script setup lang="ts">
import { watch } from 'vue'
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
        @close-auto-focus="restoreFocus"
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
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
