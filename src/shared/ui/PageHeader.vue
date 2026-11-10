<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'

// Large title of a page, with an optional way back to the parent page.
defineProps<{ title: string; eyebrow?: string; description?: string; back?: string; backLabel?: string }>()
</script>

<template>
  <header class="page-header">
    <RouterLink
      v-if="back"
      class="page-back"
      :to="back"
    >
      <ChevronLeft
        class="flip-rtl"
        aria-hidden="true"
      />
      <span>{{ backLabel }}</span>
    </RouterLink>
    <div class="page-header-main">
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
    </div>
  </header>
</template>

<style scoped>
.page-header { display: grid; gap: .625rem; }
.page-header-main { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1rem 2rem; }
.page-header-copy { display: grid; gap: .5rem; flex: 1 1 22rem; max-width: 44rem; min-width: 0; }
.page-header-copy h1 { overflow-wrap: anywhere; }
.page-eyebrow { color: var(--label-3); font-size: .9375rem; font-weight: 550; }
.page-description { color: var(--label-2); font-size: 1rem; line-height: 1.4; }
.page-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.page-back { display: inline-flex; align-items: center; justify-self: start; min-height: 32px; margin-inline-start: -.375rem; font-size: 1rem; }
.page-back svg { width: 1.375rem; height: 1.375rem; }
@media (max-width: 640px) {
  .page-actions { width: 100%; }
  .page-actions > :first-child { flex: 1 1 auto; }
}
</style>
