<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }>(), { tone: 'neutral' })
</script>

<template>
  <span
    class="tag"
    :class="tone === 'neutral' ? '' : `tag-${tone}`"
  ><slot /></span>
</template>
