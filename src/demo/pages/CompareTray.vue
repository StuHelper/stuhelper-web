<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { X } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { courseSeeds, teachers } from '../data'
import { compare, MAX_COMPARE, toggleCompare } from '../store'
const { t: tr } = useI18n()
const route = useRoute()
const kind = computed(() => (route.path.startsWith('/teachers') ? 'teacher' as const : 'course' as const))
const name = (id: string) => (kind.value === 'course' ? courseSeeds.find((r) => r[0] === id)?.[1] : teachers.find((t) => t.id === id)?.name)
const show = computed(() => compare[kind.value].length > 0 && /^\/(courses|teachers)/.test(route.path))
</script>
<template>
  <Transition name="page">
    <div v-if="show" class="tray" role="region" :aria-label="tr('demo.compareTray')">
      <span :key="compare[kind].length" class="subtle d-bump">{{ tr('demo.compareProgress', { p0: compare[kind].length, p1: MAX_COMPARE }) }}</span>
      <ul><li v-for="id in compare[kind]" :key="id" class="tag">{{ name(id) }}<button type="button" :aria-label="tr('demo.removeItem', { p0: name(id) })" @click="toggleCompare(kind, id)"><X aria-hidden="true" /></button></li></ul>
      <RouterLink v-if="compare[kind].length > 1" class="btn btn-sm btn-primary" :to="`/compare?kind=${kind}`">{{ tr('demo.startCompare') }}</RouterLink>
      <span v-else class="subtle">{{ tr('demo.pickOneMore') }}</span>
    </div>
  </Transition>
</template>
<style scoped>
.tray { view-transition-name: demo-tray; position: fixed; inset-inline: .75rem; inset-block-end: calc(var(--tab-height) + var(--safe-bottom) + .75rem); z-index: 60; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem; max-width: 46rem; margin-inline: auto; padding: .5rem .75rem; border-radius: var(--radius-lg); background: var(--glass); box-shadow: var(--shadow-float); backdrop-filter: saturate(180%) blur(24px); -webkit-backdrop-filter: saturate(180%) blur(24px); }
/* 手机上给右侧的演示身份按钮留出位置。 */
@media (max-width: 760px) { .tray { inset-inline-end: 4.25rem; } }
@media (min-width: 761px) { .tray { inset-block-end: 1rem; } }
ul { display: flex; flex: 1 1 10rem; flex-wrap: wrap; gap: .25rem; min-width: 0; }
.tag button { display: inline-grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--label-3); cursor: pointer; }
.tag button:hover { background: var(--fill-strong); color: var(--label); }
.tag svg { width: 12px; height: 12px; }
</style>
