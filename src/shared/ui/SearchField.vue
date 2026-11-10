<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

// A rounded search field with a clear button. Escape clears the text before closing anything else.
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
const { t } = useI18n()
const input = ref<HTMLInputElement>()
function clear() {
  model.value = ''
  input.value?.focus()
}
function escape(event: KeyboardEvent) {
  if (!model.value) return
  clear()
  event.stopPropagation()
}
</script>

<template>
  <div class="d-search">
    <Search aria-hidden="true" />
    <input
      ref="input"
      v-model="model"
      type="search"
      v-bind="$attrs"
      @keydown.esc="escape"
    >
    <button
      v-if="model"
      class="d-search-clear"
      type="button"
      :aria-label="t('common.clearSearch')"
      @click="clear"
    >
      <X aria-hidden="true" />
    </button>
  </div>
</template>
