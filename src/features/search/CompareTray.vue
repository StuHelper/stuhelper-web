<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { compareList, maxCompare } from './compare'

// Floating reminder on course and teacher pages while a comparison is being built.
const { t } = useI18n()
const format = useFormat()
const route = useRoute()
const kind = computed(() => (route.path.startsWith('/teachers') ? 'teacher' as const : 'course' as const))
const count = computed(() => compareList[kind.value].length)
const show = computed(() => count.value > 0 && /^\/(courses|teachers)(\/|$)/.test(route.path))
</script>

<template>
  <Transition name="page">
    <div
      v-if="show"
      class="tray"
      role="region"
      :aria-label="t('search.compare.tray')"
    >
      <span class="subtle">{{ t('search.compare.progress', { count: format.number(count), max: format.number(maxCompare) }) }}</span>
      <RouterLink
        v-if="count > 1"
        class="btn btn-sm btn-primary"
        :to="kind === 'course' ? '/compare' : '/compare?kind=teacher'"
      >
        {{ t('search.compare.start') }}
      </RouterLink>
      <span
        v-else
        class="subtle"
      >{{ t('search.compare.pickMore') }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.tray { position: fixed; inset-inline: .75rem; inset-block-end: calc(var(--tab-height) + var(--safe-bottom) + .75rem); z-index: 60; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem .75rem; max-width: 30rem; margin-inline: auto; padding: .5rem .75rem; border-radius: var(--radius-lg); background: var(--glass); box-shadow: var(--glass-edge), var(--shadow-float); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter); }
@media (min-width: 761px) { .tray { inset-block-end: 1rem; } }
</style>
