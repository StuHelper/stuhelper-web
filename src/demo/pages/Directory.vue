<script setup lang="ts">
import { ChevronRight, Search } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import { courseSeeds, departments, categories, reviews, teachers, teachesIn } from '../data'
import Level from './Level.vue'

const props = defineProps<{ kind: 'course' | 'teacher' }>()
const route = useRoute()
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const dept = ref('')
const cat = ref('')
const sort = ref<'hot' | 'recommend' | 'easy'>('hot')
watch(() => props.kind, () => { q.value = ''; dept.value = ''; cat.value = ''; sort.value = 'hot' })
const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? ''
const reviewCount = (id: string) => reviews.filter((r) => r.target_id === id || r.teacher_id === id).length
const courseRows = computed(() => courseSeeds
  .filter((r) => (!q.value.trim() || r[1].includes(q.value.trim()) || r[2].toLowerCase().includes(q.value.trim().toLowerCase())) && (!dept.value || r[3] === dept.value) && (!cat.value || r[4] === cat.value))
  .sort((a, b) => (sort.value === 'hot' ? b[7] - a[7] : sort.value === 'recommend' ? b[8][0]! - a[8][0]! || b[7] - a[7] : a[8][2]! - b[8][2]! || b[7] - a[7])))
const teacherRows = computed(() => teachers
  .filter((t) => (!q.value.trim() || t.name.includes(q.value.trim())) && (!dept.value || (t as { department_id?: string }).department_id === dept.value))
  .map((t) => { const taught = teachesIn.filter(([, p]) => p === t.id).map(([c]) => courseSeeds.find((r) => r[0] === c)!); return { ...t, taught, level: Math.max(...taught.map((r) => r[8][0]!)), heat: Math.max(...taught.map((r) => r[7])) } })
  .sort((a, b) => (sort.value === 'recommend' ? b.level - a.level : 0) || b.heat - a.heat))
const count = computed(() => (props.kind === 'course' ? courseRows.value.length : teacherRows.value.length))
const palette = ['#0071e3', '#af52de', '#ff9500', '#34c759', '#ff2d55', '#5856d6', '#32ade6']
const tint = (id: string) => palette[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % palette.length]
</script>

<template>
  <div class="stack-lg">
    <PageHeader :title="kind === 'course' ? '课程' : '教师'" :description="kind === 'course' ? '看同学的真实评价，再决定选哪门课。' : '了解老师的授课风格和同学的反馈。'" />
    <div class="stack">
      <div class="row filters">
        <div class="d-search"><Search aria-hidden="true" /><input v-model="q" type="search" :aria-label="kind === 'course' ? '搜索课程' : '搜索教师'" :placeholder="kind === 'course' ? '搜索课程名或课程代码' : '搜索教师姓名'"></div>
        <select v-model="dept" class="select mini" aria-label="开课学院"><option value="">全部学院</option><option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option></select>
        <select v-if="kind === 'course'" v-model="cat" class="select mini" aria-label="课程类别"><option value="">全部类别</option><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
      </div>
      <div class="row-between">
        <div class="d-chips" role="group" aria-label="排序">
          <button class="d-chip" type="button" :aria-pressed="sort === 'hot'" @click="sort = 'hot'">最热门</button>
          <button class="d-chip" type="button" :aria-pressed="sort === 'recommend'" @click="sort = 'recommend'">最推荐</button>
          <button v-if="kind === 'course'" class="d-chip" type="button" :aria-pressed="sort === 'easy'" @click="sort = 'easy'">难度低</button>
        </div>
        <span class="subtle" aria-live="polite">共 {{ count }} {{ kind === 'course' ? '门课程' : '位教师' }}</span>
      </div>
    </div>

    <div v-if="count === 0" class="card empty stack">
      <p>没有找到匹配的{{ kind === 'course' ? '课程' : '教师' }}。</p>
      <button class="btn btn-sm" style="justify-self:center" type="button" @click="q = ''; dept = ''; cat = ''">清除筛选</button>
    </div>
    <TransitionGroup v-else-if="kind === 'course'" tag="ul" name="rows" class="cards">
      <li v-for="r in courseRows" :key="r[0]">
        <RouterLink class="card card-link course" :to="`/courses/${r[0]}`">
          <span class="row-between head"><span class="card-title">{{ r[1] }}</span><ChevronRight class="chevron" aria-hidden="true" /></span>
          <span class="subtle">{{ deptName(r[3]) }} · {{ r[6] }} 学分 · {{ r[2] }}</span>
          <span class="dims">
            <span><small>推荐度</small><Level dim="recommendation" :level="r[8][0]!" /></span>
            <span><small>难度</small><Level dim="difficulty" :level="r[8][2]!" /></span>
            <span><small>工作量</small><Level dim="workload" :level="r[8][3]!" /></span>
          </span>
          <span class="subtle">{{ reviewCount(r[0]) ? `${reviewCount(r[0])} 条同学评价` : '等你写第一条评价' }}</span>
        </RouterLink>
      </li>
    </TransitionGroup>
    <TransitionGroup v-else tag="ul" name="rows" class="cards">
      <li v-for="row in teacherRows" :key="row.id">
        <RouterLink class="card card-link course" :to="`/teachers/${row.id}`">
          <span class="row teacher"><span class="face" :style="{ background: tint(row.id) }" aria-hidden="true">{{ row.name[0] }}</span><span class="group-body"><span class="card-title">{{ row.name }}</span><span class="subtle">{{ deptName(String((row as { department_id?: string }).department_id)) }}</span></span><ChevronRight class="chevron" aria-hidden="true" /></span>
          <span class="muted small clamp-2">{{ (row as { biography?: string }).biography }}</span>
          <span class="row"><span v-for="c in row.taught" :key="c[0]" class="tag">{{ c[1] }}</span></span>
          <span class="dims one"><span><small>同学推荐</small><Level dim="recommendation" :level="row.level" /></span></span>
        </RouterLink>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.filters { gap: .5rem; }
.mini { width: auto; min-height: 42px; padding-block: .375rem; border-radius: var(--pill); background-color: var(--surface); box-shadow: var(--shadow-card); font-size: .9375rem; flex: 0 1 11rem; }
.cards { display: grid; gap: .875rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); }
.course { gap: .625rem; }
.head { flex-wrap: nowrap; }
.dims { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr); gap: .5rem; padding: .625rem .75rem; border-radius: var(--radius-sm); background: var(--fill); }
.dims.one { grid-template-columns: 1fr; }
.dims > span { display: grid; gap: .1875rem; min-width: 0; }
.dims small { color: var(--label-3); font-size: .75rem; }
.teacher { flex-wrap: nowrap; gap: .75rem; }
.face { display: grid; flex: none; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: #fff; font-weight: 600; }
.rows-move { transition: transform .45s var(--ease-out); }
.rows-enter-active { transition: opacity .3s, transform .3s; }
.rows-leave-active { display: none; }
.rows-enter-from { opacity: 0; transform: scale(.97); }
</style>
