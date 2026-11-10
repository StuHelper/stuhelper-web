<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

// Modal surface for confirmations and short forms. Reka keeps focus inside and
// returns it to the opener. Closing goes through `close` so that a page can
// refuse while a write is in flight.
withDefaults(defineProps<{ open: boolean; title: string; description?: string; wide?: boolean }>(), { description: '', wide: false })
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
        :aria-describedby="description ? undefined : ''"
      >
        <span
          class="sheet-grabber"
          aria-hidden="true"
        />
        <DialogTitle class="sheet-title">
          {{ title }}
        </DialogTitle>
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
