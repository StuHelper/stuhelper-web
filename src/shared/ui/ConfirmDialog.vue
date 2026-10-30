<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SheetDialog from './SheetDialog.vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean }>(), { message: '', confirmLabel: '', danger: false, busy: false })
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()
function close() {
  if (!props.busy) emit('cancel')
}
</script>

<template>
  <SheetDialog
    :open="open"
    :title="title"
    :description="message"
    @close="close"
  >
    <form
      class="stack"
      @submit.prevent="emit('confirm')"
    >
      <slot />
      <div class="form-actions">
        <button
          class="btn"
          :class="danger ? 'btn-danger' : 'btn-primary'"
          type="submit"
          :disabled="busy"
        >
          {{ confirmLabel || t('common.confirm') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="busy"
          @click="emit('cancel')"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </form>
  </SheetDialog>
</template>
