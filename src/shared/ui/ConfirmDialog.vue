<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import MutationNotice from './MutationNotice.vue'
import SheetDialog from './SheetDialog.vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean; error?: string; uncertain?: boolean }>(), { message: '', confirmLabel: '', danger: false, busy: false, uncertain: false, error: '' })
const emit = defineEmits<{ confirm: []; cancel: []; retry: [] }>()
const { t } = useI18n()
function close() {
  if (!props.busy && !props.uncertain) emit('cancel')
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
      <MutationNotice
        :busy="busy"
        :uncertain="uncertain"
        :error="error"
        @retry="emit('retry')"
      />
      <div class="form-actions">
        <button
          class="btn"
          :class="danger ? 'btn-danger' : 'btn-primary'"
          type="submit"
          :disabled="busy || uncertain"
        >
          {{ confirmLabel || t('common.confirm') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="busy || uncertain"
          @click="emit('cancel')"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </form>
  </SheetDialog>
</template>
