<script setup lang="ts">
defineProps<{ title: string; eyebrow?: string; description?: string }>()
</script>

<template>
  <header class="page-header">
    <div class="page-header-copy">
      <p
        v-if="eyebrow"
        class="page-eyebrow"
      >
        {{ eyebrow }}
      </p>
      <h1>{{ title }}</h1>
      <p
        v-if="description"
        class="page-description"
      >
        {{ description }}
      </p>
      <slot />
    </div>
    <div
      v-if="$slots.actions"
      class="page-actions"
    >
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1rem 2rem; }
.page-header-copy { display: grid; gap: .45rem; max-width: 46rem; }
.page-eyebrow { font-size: .8rem; font-weight: 650; color: var(--accent); letter-spacing: .04em; }
.page-description { color: var(--muted); }
.page-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
</style>
