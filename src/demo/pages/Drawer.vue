<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
const { t: tr } = useI18n()
defineProps<{ open: boolean; title: string; note?: string }>()
defineEmits<{ close: [] }>()
</script>
<template>
  <DialogRoot :open="open" @update:open="(value) => { if (!value) $emit('close') }">
    <DialogPortal>
      <DialogOverlay class="d-drawer-overlay" />
      <DialogContent class="d-drawer" :aria-describedby="note ? undefined : ''">
        <header class="d-drawer-head">
          <div class="stack-sm"><DialogTitle as="h2">{{ title }}</DialogTitle><DialogDescription v-if="note" class="subtle">{{ note }}</DialogDescription></div>
          <button class="btn btn-icon" type="button" :aria-label="tr('demo.close')" @click="$emit('close')"><X aria-hidden="true" /></button>
        </header>
        <div class="d-drawer-body"><slot /></div>
        <footer v-if="$slots.footer" class="d-drawer-foot"><slot name="footer" /></footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
