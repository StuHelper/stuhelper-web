<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { Plus, Scale, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { courseSeeds, departments, reviews, teachers } from '../data'
import { compare, dimLabels, dimNames, levelsOf, MAX_COMPARE, toggleCompare, type CompareKind } from '../store'
import Level from './Level.vue'
import Radar from './Radar.vue'
const { t: tr } = useI18n()
const route = useRoute()
const kind = ref<CompareKind>(route.query.kind === 'teacher' ? 'teacher' : 'course')
const adding = ref('')
const dept = (id?: string) => departments.find((d) => d.id === id)?.name ?? ''
const items = computed(() => compare[kind.value].map((id) => {
  const count = reviews.filter((r) => r.target_id === id || r.teacher_id === id).length
  if (kind.value === 'course') { const c = courseSeeds.find((r) => r[0] === id)!; return { id, name: c[1], sub: tr('demo.deptCredits', { p0: dept(c[3]), p1: c[6] }), values: levelsOf('course', id), to: `/courses/${id}`, count } }
  const t = teachers.find((row) => row.id === id) as { name: string; department_id?: string }
  return { id, name: t.name, sub: dept(t.department_id), values: levelsOf('teacher', id), to: `/teachers/${id}`, count }
}))
const options = computed(() => (kind.value === 'course' ? courseSeeds.map((c) => ({ id: c[0], name: c[1] })) : teachers.map((t) => ({ id: t.id, name: t.name }))).filter((o) => !compare[kind.value].includes(o.id)))
const suggestions = computed(() => (kind.value === 'course' ? [...courseSeeds].sort((a, b) => b[7] - a[7]).map((c) => ({ id: c[0], name: c[1] })) : teachers.map((t) => ({ id: t.id, name: t.name }))).slice(0, 4))
function add() { if (adding.value) toggleCompare(kind.value, adding.value); adding.value = '' }
// 推荐度、质量和给分越高越好。难度和工作量没有好坏，各项相同时也没有更好的一项。
const best = (i: number) => { const v = items.value.map((x) => x.values[i]!); return i === 2 || i === 3 || Math.min(...v) === Math.max(...v) ? 0 : Math.max(...v) }
const tabs = computed(() => [{ value: 'course', label: tr('demo.coursesCount', { p0: compare.course.length }) }, { value: 'teacher', label: tr('demo.teachersCount', { p0: compare.teacher.length }) }])
</script>
<template>
  <div class="stack-lg">
    <PageHeader :title="tr('demo.compare')" :description="tr('demo.compareDescription', { p0: MAX_COMPARE })">
      <template #actions><AppSelect v-model="adding" class="select add" :aria-label="tr('demo.addCompareItem')" :disabled="compare[kind].length >= MAX_COMPARE" @change="add"><option value="">{{ tr('demo.addCompareItem') }}</option><option v-for="o in options" :key="o.id" :value="o.id">{{ o.name }}</option></AppSelect></template>
    </PageHeader>
    <TabBar v-model="kind" :tabs="tabs" :label="tr('demo.compareKind')" id-prefix="compare" />
    <div v-if="!items.length" class="card compare-empty">
      <span class="icon-tile big" style="--tile:var(--c-indigo)"><Scale aria-hidden="true" /></span>
      <h2 class="d-title">{{ tr('demo.compareEmptyTitle') }}</h2>
      <p class="muted small">{{ tr('demo.compareEmptyHint') }}</p>
      <div class="row picks"><button v-for="o in suggestions" :key="o.id" class="d-chip" type="button" @click="toggleCompare(kind, o.id)"><Plus aria-hidden="true" />{{ o.name }}</button></div>
      <RouterLink class="small" :to="kind === 'course' ? '/courses' : '/teachers'">{{ kind === 'course' ? tr('demo.browseAllCourses') : tr('demo.browseAllTeachers') }}</RouterLink>
    </div>
    <template v-else>
      <div v-if="items.length > 1" class="card"><Radar :series="items.map((x) => ({ name: x.name, values: x.values }))" :size="320" /></div>
      <div class="card flush"><div class="scroll"><table>
        <thead><tr><th scope="col" class="dim">{{ tr('demo.item') }}</th><th v-for="x in items" :key="x.id" scope="col"><div class="row-between head"><div class="group-body"><RouterLink class="card-title" :to="x.to">{{ x.name }}</RouterLink><span class="subtle">{{ x.sub }}</span></div><button class="btn btn-sm btn-icon" type="button" :aria-label="tr('demo.removeItem', { p0: x.name })" @click="toggleCompare(kind, x.id)"><X aria-hidden="true" /></button></div></th></tr></thead>
        <tbody>
          <tr v-for="(name, i) in dimNames" :key="name"><th scope="row" class="dim">{{ dimLabels[i] }}</th><td v-for="x in items" :key="x.id" :class="{ best: items.length > 1 && x.values[i] === best(i) }"><Level v-if="x.values[i]" :dim="name" :level="x.values[i]!" /><span v-else class="subtle">{{ tr('demo.notEnoughData') }}</span></td></tr>
          <tr><th scope="row" class="dim">{{ tr('demo.reviewCountLabel') }}</th><td v-for="x in items" :key="x.id" class="small">{{ tr('demo.countOnly', { p0: x.count }) }}</td></tr>
        </tbody>
      </table></div></div>
      <p class="subtle">{{ tr('demo.compareNote') }}</p>
    </template>
  </div>
</template>
<style scoped>
.add { width: auto; max-width: 14rem; }
.flush { padding: 0; overflow: hidden; }
.scroll { overflow-x: auto; }
table { width: 100%; min-width: 34rem; border-collapse: collapse; }
th, td { padding: .75rem 1rem; border-block-end: .5px solid var(--separator); text-align: start; font-weight: 400; vertical-align: middle; }
tr:last-child > * { border-block-end: 0; }
.dim { width: 6rem; color: var(--label-3); font-size: .8125rem; }
.head { flex-wrap: nowrap; align-items: flex-start; }
.best { background: var(--accent-soft); }
.compare-empty { display: grid; justify-items: center; gap: .5rem; padding-block: 2.5rem; text-align: center; }
.big { width: 52px; height: 52px; border-radius: 14px; }
.big svg { width: 28px; height: 28px; }
.picks { justify-content: center; margin-block: .5rem; }
.picks .d-chip { display: inline-flex; align-items: center; gap: .25rem; }
.picks svg { width: .875rem; height: .875rem; }
</style>
