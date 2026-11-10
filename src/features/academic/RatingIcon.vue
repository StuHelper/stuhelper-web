<script setup lang="ts">
import { computed } from 'vue'
import { dimensions } from './api'

// Drawn rating symbols, so they match the interface on every platform.
// Difficulty and workload use neutral bars so "hard" never reads as "bad".
const props = withDefaults(defineProps<{ dimension: number; level: number; mono?: boolean }>(), { mono: false })
const effort = computed(() => ['difficulty', 'workload'].includes(dimensions[props.dimension] ?? ''))
const mouths = ['M6.4 14.3Q10 10 13.6 14.3', 'M7 13.7Q10 11.7 13 13.7', 'M7 12.8H13', 'M7 11.8Q10 14.3 13 11.8', 'M6.3 11.2Q10 16.6 13.7 11.2']
const tones = ['var(--danger)', 'var(--warning)', 'var(--label-3)', 'var(--success)', 'var(--success)']
const color = computed(() => (props.mono ? 'currentColor' : effort.value ? 'var(--label-2)' : tones[props.level - 1]))
</script>

<template>
  <svg
    v-if="level >= 1 && level <= 5"
    class="rating-icon"
    viewBox="0 0 20 20"
    width="1.25em"
    height="1.25em"
    aria-hidden="true"
    :style="{ color }"
  >
    <template v-if="effort">
      <rect
        v-for="n in 5"
        :key="n"
        :x="1.4 + (n - 1) * 3.6"
        :y="17.5 - n * 3"
        width="2.6"
        :height="n * 3"
        rx="1.3"
        fill="currentColor"
        :opacity="n <= level ? 1 : .2"
      />
    </template>
    <template v-else>
      <circle
        cx="10"
        cy="10"
        r="8.4"
        fill="currentColor"
        fill-opacity=".14"
        stroke="currentColor"
        stroke-width="1.4"
      />
      <circle
        cx="7.2"
        cy="8"
        r="1.1"
        fill="currentColor"
      />
      <circle
        cx="12.8"
        cy="8"
        r="1.1"
        fill="currentColor"
      />
      <path
        :d="mouths[level - 1]"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </template>
  </svg>
</template>

<style scoped>
.rating-icon { flex: none; }
</style>
