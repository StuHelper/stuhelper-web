<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
const { t: tr } = useI18n()
// 显示当前生效的筛选条件。只有一个条件时不再显示“清除全部”。
defineProps<{ items: { key: string; label: string; clear: () => void }[]; total?: string }>()
defineEmits<{ clearAll: [] }>()
</script>
<template>
  <div v-if="items.length" class="d-active" role="group" :aria-label="tr('demo.activeFilters')">
    <span v-if="total" class="subtle">{{ total }}</span>
    <button v-for="item in items" :key="item.key" class="d-active-item" type="button" :aria-label="tr('demo.removeFilter', { p0: item.label })" @click="item.clear()">{{ item.label }}<X aria-hidden="true" /></button>
    <button v-if="items.length > 1" class="d-active-all" type="button" @click="$emit('clearAll')">{{ tr('demo.clearAll') }}</button>
  </div>
</template>
