<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { ChevronDown, Eye, Scale } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import { categories, courseSeeds, departments, reviews, teachers, teachesIn } from '../data'
import { compare, teacherLevels, toggleCompare } from '../store'
import FavoriteButton from '../../features/favorites/FavoriteButton.vue'
import FilterBar from './FilterBar.vue'
import RowMore from './RowMore.vue'
import SearchField from '../../shared/ui/SearchField.vue'
import Level from './Level.vue'
import QuickView from './QuickView.vue'
const { t: tr } = useI18n()

const props = defineProps<{ kind: 'course' | 'teacher' }>()
const route = useRoute()
const router = useRouter()
// 筛选条件保存在网址里，从详情返回或分享链接时都能恢复。
type Sort = 'hot' | 'recommend' | 'reviews' | 'name'
const read = (key: string) => (typeof route.query[key] === 'string' ? route.query[key] : '')
const readCategory = () => (categories.some((c) => c.id === read('category')) ? read('category') : '')
const readDept = () => (departments.some((d) => d.id === read('dept')) ? read('dept') : '')
const readSort = (): Sort => (['recommend', 'reviews', 'name'].includes(read('sort')) ? read('sort') as Sort : 'hot')
const q = ref(read('q'))
const dept = ref(readDept())
const cat = ref(readCategory())
const sort = ref<Sort>(readSort())
const grouped = ref(false)
const quick = ref<string>()
const expanded = reactive(new Set<string>())
const PREVIEW = 5
try { grouped.value = localStorage.getItem('demo-directory-grouped') === '1' } catch { /* 隐私窗口使用默认视图 */ }
watch(grouped, (value) => { try { localStorage.setItem('demo-directory-grouped', value ? '1' : '0') } catch { /* 同上 */ } })
watch([q, dept, cat, sort], ([search, department, category, order]) => {
  const query = { ...route.query }
  for (const [key, value] of [['q', search.trim()], ['dept', department], ['category', category], ['sort', order === 'hot' ? '' : order]] as const) {
    if (value) query[key] = value
    else delete query[key]
  }
  if (JSON.stringify(query) !== JSON.stringify(route.query)) void router.replace({ query })
})
// 站内跳转、前进后退和类型切换都以网址为准。值相同时不会再次触发上面的写回。
watch(() => route.query, () => { q.value = read('q'); dept.value = readDept(); cat.value = readCategory(); sort.value = readSort() })
watch(() => props.kind, () => expanded.clear())
const teacher = computed(() => read('teacher'))

interface Row { id: string; name: string; sub: string; dept: string; category: string; reviews: number; heat: number }
const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? ''
const catKeys: Record<string, string> = {'c-pe': 'demo.categoryCPe', 'c-en': 'demo.categoryCEn', 'c-pol': 'demo.categoryCPol', 'c-hx': 'demo.categoryCHx', 'c-gen': 'demo.categoryCGen', 'c-sy': 'demo.categoryCSy', 'c-base': 'demo.categoryCBase', 'c-core': 'demo.categoryCCore'}
const catName = (id: string) => (catKeys[id] ? tr(catKeys[id]) : '')
const courseRows = courseSeeds.map((r): Row => ({ id: r[0], name: r[1], sub: tr('demo.deptCredits', { p0: r[2], p1: r[6] }), dept: r[3], category: r[4], reviews: reviews.filter((x) => x.target_id === r[0]).length, heat: r[7] }))
const teacherRows = teachers.map((t) => {
  const taught = teachesIn.filter(([, p]) => p === t.id).map(([c]) => courseSeeds.find((r) => r[0] === c)!)
  return { ...t, dept: String((t as { department_id?: string }).department_id), biography: (t as { biography?: string }).biography, level: teacherLevels(t.id)[0]!, heat: Math.max(...taught.map((r) => r[7])) }
})
const palette = ['var(--c-blue)', 'var(--c-purple)', 'var(--c-orange)', 'var(--c-green)', 'var(--c-pink)', 'var(--c-indigo)', 'var(--c-cyan)']
// 头像上是白字，底色压暗后才有足够对比度。
const tint = (id: string) => `color-mix(in srgb, ${palette[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % palette.length]} 72%, black)`
const key = computed(() => q.value.trim().toLowerCase())
const searched = computed(() => courseRows.filter((r) => (!teacher.value || teachesIn.some(([c, p]) => c === r.id && p === teacher.value)) && (!key.value || r.name.toLowerCase().includes(key.value) || r.sub.toLowerCase().includes(key.value)) && (!dept.value || r.dept === dept.value)))
const teacherList = computed(() => teacherRows
  .filter((t) => (!key.value || t.name.toLowerCase().includes(key.value)) && (!dept.value || t.dept === dept.value))
  .sort((a, b) => (sort.value === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : (sort.value === 'recommend' ? b.level - a.level : 0) || b.heat - a.heat)))
const tabs = computed(() => [{ id: '', name: tr('demo.all'), count: searched.value.length }, ...categories.map((c) => ({ id: c.id, name: catName(c.id), count: searched.value.filter((r) => r.category === c.id).length }))])
const rows = computed(() => searched.value
  .filter((r) => !cat.value || r.category === cat.value)
  .sort((a, b) => (sort.value === 'name' ? a.name.localeCompare(b.name, 'zh-CN') : sort.value === 'reviews' ? b.reviews - a.reviews || b.heat - a.heat : b.heat - a.heat)))
const groups = computed(() => {
  if (!grouped.value) return [{ id: '', name: '', rows: rows.value, reviews: 0 }]
  return departments
    .map((d) => { const inDept = rows.value.filter((r) => r.dept === d.id); return { id: d.id, name: d.name, rows: inDept, reviews: inDept.reduce((sum, r) => sum + r.reviews, 0) } })
    .filter((g) => g.rows.length)
})
const visible = (group: { id: string; rows: Row[] }) => (!group.id || expanded.has(group.id) ? group.rows : group.rows.slice(0, PREVIEW))
const reviewText = (n: number) => (n ? tr('demo.reviewCount', { p0: n }) : tr('demo.noReviews'))
const count = computed(() => (props.kind === 'course' ? rows.value.length : teacherList.value.length))
const activeFilters = computed(() => [
  ...(cat.value ? [{ key: 'cat', label: catName(cat.value), clear: () => { cat.value = '' } }] : []),
  ...(dept.value ? [{ key: 'dept', label: deptName(dept.value), clear: () => { dept.value = '' } }] : []),
  ...(q.value.trim() ? [{ key: 'q', label: `“${q.value.trim()}”`, clear: () => { q.value = '' } }] : []),
])
// 换条件时整组淡入。输入搜索词不算，否则每按一个键都会闪一下。
const listKey = computed(() => `${cat.value}|${dept.value}|${sort.value}|${grouped.value}`)
const clear = () => { q.value = ''; dept.value = ''; cat.value = '' }
</script>

<template>
  <div class="stack list-page">
    <PageHeader :title="kind === 'course' ? tr('demo.courses') : tr('demo.teachers')" :description="kind === 'course' ? tr('demo.totalCourses', { p0: count }) : tr('demo.totalTeachers', { p0: count })" />
    <div class="stack-sm toolbar">
      <div v-if="kind === 'course'" class="d-chips" role="group" :aria-label="tr('demo.courseCategory')">
        <button v-for="tab in tabs" :key="tab.id" class="d-chip" type="button" :aria-pressed="cat === tab.id" @click="cat = tab.id">{{ tab.name }} <span class="num">{{ tab.count }}</span></button>
      </div>
      <div class="row filters">
        <SearchField v-model="q" :aria-label="kind === 'course' ? tr('demo.searchCourses') : tr('demo.searchTeachers')" :placeholder="kind === 'course' ? tr('demo.searchCourseHint') : tr('demo.searchTeacherName')" />
        <AppSelect v-model="dept" class="select mini" :aria-label="tr('demo.offeringDepartment')"><option value="">{{ tr('demo.allDepartments') }}</option><option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option></AppSelect>
        <AppSelect v-model="sort" class="select mini" :aria-label="tr('demo.sort')"><option value="hot">{{ tr('demo.hottest') }}</option><option v-if="kind === 'teacher'" value="recommend">{{ tr('demo.mostRecommended') }}</option><option v-if="kind === 'course'" value="reviews">{{ tr('demo.mostReviews') }}</option><option value="name">{{ tr('demo.byName') }}</option></AppSelect>
        <div v-if="kind === 'course'" class="d-seg view" role="group" :aria-label="tr('demo.listMode')">
          <button class="btn" type="button" :aria-pressed="!grouped" @click="grouped = false">{{ tr('demo.all') }}</button>
          <button class="btn" type="button" :aria-pressed="grouped" @click="grouped = true">{{ tr('demo.byDepartment') }}</button>
        </div>
      </div>
      <FilterBar :items="activeFilters" @clear-all="clear" />
      <span class="visually-hidden" aria-live="polite">{{ kind === 'course' ? tr('demo.totalCourses', { p0: count }) : tr('demo.totalTeachers', { p0: count }) }}</span>
    </div>

    <div v-if="count === 0" class="card empty stack">
      <p>{{ kind === 'course' ? tr('demo.noMatchCourses') : tr('demo.noMatchTeachers') }}</p>
      <button class="btn btn-sm" style="justify-self:center" type="button" @click="clear">{{ tr('demo.clearFilters') }}</button>
    </div>
    <ul v-else-if="kind === 'teacher'" :key="listKey" class="cards d-list-in">
      <li v-for="row in teacherList" :key="row.id" class="card teacher-card">
        <div class="row teacher"><span class="face" :style="{ background: tint(row.id) }" aria-hidden="true">{{ row.name[0] }}</span><span class="group-body"><RouterLink class="card-title" :to="`/teachers/${row.id}`">{{ row.name }}</RouterLink><span class="subtle">{{ deptName(row.dept) }}</span></span><FavoriteButton :id="row.id" kind="teacher" /></div>
        <span class="muted small clamp-2">{{ row.biography }}</span>
        <span class="dims"><small>{{ tr('demo.teacherOverallScore') }}</small><Level dim="recommendation" :level="row.level" /></span>
        <div class="foot"><button class="btn btn-sm" type="button" @click="quick = row.id"><Eye aria-hidden="true" />{{ tr('demo.quickView') }}</button><button class="btn btn-sm" type="button" :aria-pressed="compare.teacher.includes(row.id)" @click="toggleCompare('teacher', row.id)"><Scale aria-hidden="true" />{{ compare.teacher.includes(row.id) ? tr('demo.inCompare') : tr('demo.compare') }}</button></div>
      </li>
    </ul>
    <div v-else :key="listKey" class="sections d-list-in" :class="{ split: grouped }">
      <section v-for="group in groups" :key="group.id" class="card flush" :aria-label="group.name || undefined">
        <header v-if="group.id" class="group-head">
          <h2 class="card-title">{{ group.name }}</h2>
          <span class="subtle">{{ tr('demo.groupCourses', { p0: group.rows.length, p1: reviewText(group.reviews) }) }}</span>
        </header>
        <div v-else class="line head" aria-hidden="true"><span>{{ tr('demo.courses') }}</span><span>{{ tr('demo.department') }}</span><span>{{ tr('demo.category') }}</span><span>{{ tr('demo.reviews') }}</span><span /></div>
        <ul>
          <li v-for="r in visible(group)" :key="r.id" class="line" :class="{ compact: group.id }">
            <span class="main">
              <RouterLink class="name truncate" :data-tip="r.name" :to="`/courses/${r.id}`">{{ r.name }}</RouterLink>
              <span class="subtle truncate">{{ r.sub }}</span>
              <span class="subtle truncate phone">{{ catName(r.category) }} · {{ reviewText(r.reviews) }}</span>
            </span>
            <template v-if="!group.id">
              <span class="cell small truncate">{{ deptName(r.dept) }}</span>
              <span class="cell"><span class="tag">{{ catName(r.category) }}</span></span>
              <span class="cell small" :class="{ none: !r.reviews }">{{ r.reviews || '—' }}</span>
            </template>
            <span class="ops">
              <button class="btn btn-sm btn-icon desk" type="button" :aria-label="tr('demo.quickViewItem', { p0: r.name })" @click="quick = r.id"><Eye aria-hidden="true" /></button>
              <button class="btn btn-sm btn-icon desk" type="button" :aria-label="compare.course.includes(r.id) ? tr('demo.removeItemFromCompare', { p0: r.name }) : tr('demo.compareItem', { p0: r.name })" :aria-pressed="compare.course.includes(r.id)" @click="toggleCompare('course', r.id)"><Scale aria-hidden="true" /></button>
              <FavoriteButton :id="r.id" kind="course" />
              <RowMore :label="tr('demo.moreActionsFor', { p0: r.name })" :items="[{ label: tr('demo.quickView'), icon: Eye, action: () => { quick = r.id } }, { label: compare.course.includes(r.id) ? tr('demo.removeFromCompare') : tr('demo.addToCompare'), icon: Scale, action: () => toggleCompare('course', r.id) }]" />
            </span>
          </li>
        </ul>
        <button v-if="group.id && group.rows.length > PREVIEW" class="more" type="button" :aria-expanded="expanded.has(group.id)" @click="expanded.has(group.id) ? expanded.delete(group.id) : expanded.add(group.id)">
          <ChevronDown :class="{ flip: expanded.has(group.id) }" aria-hidden="true" />{{ expanded.has(group.id) ? tr('demo.collapse') : tr('demo.expandAll', { p0: group.rows.length }) }}
        </button>
      </section>
    </div>
    <QuickView :id="quick" :kind="kind" @close="quick = undefined" />
  </div>
</template>

<style scoped>
.list-page { gap: 1rem; }
/* 桌面端筛选区吸顶。手机屏幕矮，吸顶会挡住太多内容。 */
@media (min-width: 761px) { .toolbar { position: sticky; inset-block-start: var(--nav-height); z-index: 30; margin-inline: -.5rem; padding: .5rem; background: var(--bg); } }
.filters { gap: .5rem; }
.mini { width: auto; min-height: 42px; padding-block: .375rem; border-radius: var(--pill); background-color: var(--surface); box-shadow: var(--shadow-card); font-size: .9375rem; flex: 1 1 8rem; }
@media (min-width: 761px) { .mini { flex: 0 1 11rem; } }
.num { margin-inline-start: .125rem; opacity: .6; font-size: .8125rem; font-variant-numeric: tabular-nums; }
.view { flex: none; margin-inline-start: auto; }
.view .btn { width: auto; padding-inline: .75rem; font-size: .8125rem; }
.cards { display: grid; gap: .875rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, max(16rem, (100% - 1.75rem) / 3)), 1fr)); }
/* 同一行卡片等高，简介长短不一时评分和按钮贴底对齐。 */
.teacher-card { display: flex; flex-direction: column; gap: .625rem; }
.teacher { flex-wrap: nowrap; gap: .75rem; }
.face { display: grid; flex: none; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: #fff; font-weight: 600; }
.dims { margin-block-start: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem .75rem; }
.dims small { color: var(--label-2); font-size: .8125rem; }
.foot { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
.sections { display: grid; gap: .875rem; }
.sections.split { grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr)); align-items: start; }
.flush { min-width: 0; padding: 0; overflow: hidden; container-type: inline-size; }
.group-head { display: grid; gap: .0625rem; padding: .75rem 1rem; border-block-end: .5px solid var(--separator); background: var(--fill); }
.line { position: relative; display: grid; align-items: center; gap: .75rem; min-height: 44px; padding: .25rem 1rem; }
.line { grid-template-columns: minmax(0, 1fr) 12rem 6.5rem 3.5rem 7rem; }
.line.compact { grid-template-columns: minmax(0, 1fr) 7rem; }
li.line + li.line { border-block-start: .5px solid var(--separator); }
li.line:hover { background: var(--fill); }
.head { min-height: 34px; padding-block: .25rem; border-block-end: .5px solid var(--separator); color: var(--label-3); font-size: .8125rem; }
.main { display: grid; min-width: 0; line-height: 1.3; }
.name { color: var(--label); font-size: .9375rem; font-weight: 550; }
.name::after { content: ""; position: absolute; inset: 0; }
.name:hover { color: var(--accent); text-decoration: none; }
.main .subtle { font-size: .75rem; }
.phone { display: none; }
/* 名称和代码、学分放得下时排在一行。带学院等列的行要给这些列留宽度，所以门槛更高。 */
@container (min-width: 30rem) {
  li.line.compact { min-height: 40px; padding-block: .125rem; }
  .line.compact .main { display: flex; align-items: baseline; gap: .625rem; }
  .line.compact .main .subtle { flex: none; }
}
@container (min-width: 58rem) {
  li.line:not(.compact) { min-height: 40px; padding-block: .125rem; }
  .line:not(.compact) .main { display: flex; align-items: baseline; gap: .625rem; }
  .line:not(.compact) .main .subtle { flex: none; }
}
.cell { min-width: 0; color: var(--label-2); font-variant-numeric: tabular-nums; }
.cell.none { color: var(--label-3); }
.ops { position: relative; z-index: 1; display: flex; justify-content: flex-end; gap: .25rem; }
@media (hover: hover) {
  .ops .btn { opacity: 0; transition: opacity .15s; }
  li.line:hover .ops .btn, li.line:focus-within .ops .btn, .ops .btn[aria-pressed="true"] { opacity: 1; }
}
.more { display: flex; align-items: center; justify-content: center; gap: .25rem; width: 100%; min-height: 40px; border: 0; border-block-start: .5px solid var(--separator); background: transparent; color: var(--accent); font: inherit; font-size: .875rem; cursor: pointer; }
.more:hover { background: var(--fill); }
.more svg { width: 1rem; height: 1rem; transition: transform .2s; }
.more svg.flip { transform: rotate(180deg); }
@media (max-width: 760px) {
  .line, .line.compact { grid-template-columns: minmax(0, 1fr) auto; }
  .head, .cell { display: none; }
  .phone { display: block; }
  .name { white-space: normal; }
  .line { padding-inline: .875rem; }
    .ops .btn { opacity: 1; }
  .ops .desk { display: none; }
}
</style>
