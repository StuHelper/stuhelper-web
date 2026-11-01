<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Scale } from 'lucide-vue-next'
import { computed } from 'vue'
import { compare, toggleCompare } from '../store'
const { t: tr } = useI18n()
const props = defineProps<{ kind: 'course' | 'teacher'; id: string }>()
const on = computed(() => compare[props.kind].includes(props.id))
</script>
<template>
  <button class="btn" type="button" :aria-pressed="on" @click="toggleCompare(kind, id)"><Scale aria-hidden="true" />{{ on ? tr('demo.inCompare') : tr('demo.addToCompare') }}</button>
</template>
