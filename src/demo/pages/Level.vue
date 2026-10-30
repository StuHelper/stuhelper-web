<script setup lang="ts">
import { computed } from 'vue'
import { levelText } from '../store'
const props = defineProps<{ dim: keyof typeof levelText; level: number; label?: boolean }>()
// 难度和工作量没有好坏之分，用中性色显示。
const color = computed(() => (props.dim === 'difficulty' || props.dim === 'workload' ? '#ff9500' : props.level >= 4 ? '#34c759' : props.level === 3 ? '#0071e3' : '#ff3b30'))
</script>
<template>
  <span class="d-level">
    <span class="d-dots" :style="{ '--dot': color }" aria-hidden="true"><i v-for="n in 5" :key="n" :class="{ on: n <= level }" /></span>
    {{ levelText[dim][level] }}
  </span>
</template>
