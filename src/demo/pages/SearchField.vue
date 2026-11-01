<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Search, X } from 'lucide-vue-next'
import { ref } from 'vue'
const { t: tr } = useI18n()
defineOptions({ inheritAttrs: false })
const model = defineModel<string>({ required: true })
const input = ref<HTMLInputElement>()
function clear() { model.value = ''; input.value?.focus() }
</script>
<template>
  <div class="d-search">
    <Search aria-hidden="true" />
    <input ref="input" v-model="model" type="search" v-bind="$attrs" @keydown.esc="model && (clear(), $event.stopPropagation())">
    <button v-if="model" class="d-search-clear" type="button" :aria-label="tr('demo.clearSearch')" @click="clear"><X aria-hidden="true" /></button>
  </div>
</template>
