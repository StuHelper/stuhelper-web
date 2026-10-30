<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

// A modal confirmation that keeps keyboard focus inside the dialog and returns
// focus to the opener when it closes.
const props = withDefaults(defineProps<{ open: boolean; title: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean }>(), { message: '', confirmLabel: '', danger: false, busy: false })
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
let opener: Element | null = null

watch(() => props.open, async (open) => {
  await nextTick()
  if (!dialog.value) return
  if (open && !dialog.value.open) {
    opener = document.activeElement
    dialog.value.showModal()
  } else if (!open && dialog.value.open) {
    dialog.value.close()
    if (opener instanceof HTMLElement) opener.focus()
  }
}, { immediate: true })
</script>

<template>
  <dialog
    ref="dialog"
    class="dialog"
    :aria-label="title"
    @cancel.prevent="emit('cancel')"
  >
    <form
      class="dialog-body"
      method="dialog"
      @submit.prevent="emit('confirm')"
    >
      <h2>{{ title }}</h2>
      <p
        v-if="message"
        class="muted"
      >
        {{ message }}
      </p>
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
  </dialog>
</template>
