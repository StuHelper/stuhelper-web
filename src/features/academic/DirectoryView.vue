<script setup lang="ts">
import { ChevronDown, Eye, Scale } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync, usePaged } from '../../shared/composables/async'
import { usePageFilters } from '../../shared/pageFilters'
import AppSelect from '../../shared/ui/AppSelect.vue'
import FilterBar from '../../shared/ui/FilterBar.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import RowMore from '../../shared/ui/RowMore.vue'
import SearchField from '../../shared/ui/SearchField.vue'
import { toast } from '../../shared/ui/toast'
import { useCampusId } from '../account/access'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import { compareList, maxCompare, toggleCompare } from '../search/compare'
import { knownCredits, listSize, useAcademic, type DirectoryFacet, type DirectoryItem, type DirectorySort } from './api'
import QuickView from './QuickView.vue'
import { recommendationLevel } from './ratings/levels'
import RatingLevel from './ratings/RatingLevel.vue'

// Course or teacher directory. Rows, counts and facets come from the catalog directory
// endpoint, which only returns visible objects (content state, school, cut-off term,
// teacher marks). Options whose count is zero under the other filters are not shown.
// Filters live in page state, not the address.
const props = defineProps<{ kind: 'course' | 'teacher' }>()
const { t } = useI18n()
const format = useFormat()
const api = useAcademic()
const campus = useCampusId()
const page = usePageFilters(['q', 'category', 'department', 'teacher', 'sort'] as const)
const sorts = computed<DirectorySort[]>(() => (props.kind === 'course' ? ['hot', 'reviews', 'name'] : ['hot', 'recommend', 'name']))
const applied = computed(() => {
  const f = page.values.value
  const course = props.kind === 'course'
  return {
    q: f.q.trim().slice(0, 200),
    category: course ? f.category : '',
    department: f.department,
    teacher: course ? f.teacher : '',
    sort: (sorts.value as string[]).includes(f.sort) ? (f.sort as DirectorySort) : 'hot',
  }
})
const text = ref(applied.value.q)
// The row already knows the name, so the quick view shows its heading before anything loads.
const quick = ref<{ id: string; name: string; note: string }>()

// The grouped view is a per-browser display choice, not a filter.
const groupedKey = 'stuhelper.directory.grouped'
const grouped = ref((() => { try { return localStorage.getItem(groupedKey) === '1' } catch { return false } })())
watch(grouped, (value) => { try { localStorage.setItem(groupedKey, value ? '1' : '0') } catch { /* private windows keep the default */ } })

const facets = shallowRef<{ total: number; facetTotal: number; categories: DirectoryFacet[]; departments: DirectoryFacet[] }>({ total: 0, facetTotal: 0, categories: [], departments: [] })
const query = (after: string, overrides: Record<string, string | number | undefined> = {}) => {
  const f = applied.value
  return { kind: props.kind, school_id: campus.value, q: f.q || undefined, category_id: f.category || undefined, department_id: f.department || undefined, teacher_id: f.teacher || undefined, sort: f.sort, after: after || undefined, limit: listSize, ...overrides }
}
// Each arrival of a first page replays the list entrance; appended pages do not.
const arrival = ref(0)
// While a search or filter change loads, the previous rows stay on screen dimmed instead of
// flashing a skeleton. A failed reload clears them.
const results = usePaged<DirectoryItem>(async (after, signal) => {
  const result = await api.directory(query(after), signal)
  if (!after) {
    facets.value = { total: result.total, facetTotal: result.facet_total, categories: result.category_facets, departments: result.department_facets }
    arrival.value += 1
  }
  return { items: result.items, next: result.next }
}, { resetOnConflict: true, keepRows: true })
// Department facets keep every condition, so with a department chosen the other departments
// would all count zero. A one-row request without the department supplies their counts.
const otherDepartments = useAsync(async (signal) => (applied.value.department ? (await api.directory(query('', { department_id: undefined, limit: 1 }), signal)).department_facets : undefined))
const teacherName = useAsync(async (signal) => (applied.value.teacher ? (await api.lookup([applied.value.teacher], signal)).get(applied.value.teacher)?.name ?? '' : ''))

const categories = computed(() => facets.value.categories.filter((f) => f.count > 0 || f.id === applied.value.category))
const departments = computed(() => (otherDepartments.data.value ?? facets.value.departments).filter((f) => f.count > 0 || f.id === applied.value.department))
const departmentName = (id: string) => departments.value.find((f) => f.id === id)?.name ?? facets.value.departments.find((f) => f.id === id)?.name ?? ''
const count = computed(() => facets.value.total)

watch(() => `${props.kind} ${campus.value} ${JSON.stringify(applied.value)}`, () => {
  text.value = applied.value.q
  void results.reload()
  void otherDepartments.reload()
  void teacherName.reload()
}, { immediate: true })

// Typing waits for a pause so each key press does not start a request.
let typing: ReturnType<typeof setTimeout> | undefined
// A pending search must not write into another page's state after this one is left.
onBeforeUnmount(() => clearTimeout(typing))
watch(text, (value) => {
  clearTimeout(typing)
  if (value.trim() === applied.value.q) return
  typing = setTimeout(() => page.replace({ q: value.trim() || undefined }), 300)
})
const set = (changes: Partial<Record<'q' | 'category' | 'department' | 'teacher' | 'sort', string | undefined>>) => page.replace(changes)
const clear = () => { text.value = ''; set({ q: undefined, category: undefined, department: undefined, teacher: undefined }) }

const activeFilters = computed(() => [
  ...(applied.value.category ? [{ key: 'category', label: facets.value.categories.find((f) => f.id === applied.value.category)?.name ?? t('browse.category'), clear: () => set({ category: undefined }) }] : []),
  ...(applied.value.department ? [{ key: 'department', label: departmentName(applied.value.department) || t('browse.department'), clear: () => set({ department: undefined }) }] : []),
  ...(applied.value.teacher ? [{ key: 'teacher', label: t('academic.directory.taughtBy', { name: teacherName.data.value || t('common.unknown') }), clear: () => set({ teacher: undefined }) }] : []),
  ...(applied.value.q ? [{ key: 'q', label: `“${applied.value.q}”`, clear: () => { text.value = ''; set({ q: undefined }) } }] : []),
])

// Grouping applies to the rows loaded so far; header counts come from the department facets,
// so a group shows its full size even before every row is loaded.
const PREVIEW = 5
const expanded = ref(new Set<string>())
const groups = computed(() => {
  const rows = results.items.value
  if (!grouped.value || props.kind !== 'course') return [{ id: '', name: '', rows, count: 0, reviews: 0 }]
  const map = new Map<string, DirectoryItem[]>()
  for (const row of rows) {
    const id = row.departments[0]?.id ?? ''
    map.set(id, [...(map.get(id) ?? []), row])
  }
  return [...map].map(([id, list]) => {
    const facet = facets.value.departments.find((f) => f.id === id)
    return { id: id || '-', name: facet?.name ?? list[0]?.departments[0]?.name ?? t('common.unknown'), rows: list, count: facet?.count ?? list.length, reviews: facet?.review_count ?? 0 }
  })
})
const visible = (group: { id: string; rows: DirectoryItem[] }) => (!group.id || expanded.value.has(group.id) ? group.rows : group.rows.slice(0, PREVIEW))
function toggleGroup(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}
const reviewText = (n: number) => (n ? t('browse.reviewCount', { p0: format.value.number(n) }) : t('browse.noReviews'))
const sub = (row: DirectoryItem) => {
  const credits = knownCredits(row.object)
  return [row.object.code, credits === undefined ? '' : t('academic.subject.credits', { credits: format.value.number(credits) })].filter(Boolean).join(' · ')
}
const listKey = computed(() => `${arrival.value}|${grouped.value}`)
const level = (row: DirectoryItem) => recommendationLevel[row.recommendation]
const open = (row: DirectoryItem) => { quick.value = { id: row.object.id, name: row.object.name, note: props.kind === 'course' ? [sub(row), row.departments[0]?.name].filter(Boolean).join(' · ') : row.departments[0]?.name ?? '' } }
const palette = ['var(--c-blue)', 'var(--c-purple)', 'var(--c-orange)', 'var(--c-green)', 'var(--c-pink)', 'var(--c-indigo)', 'var(--c-cyan)']
// White initials need a darkened background for contrast.
const tint = (id: string) => `color-mix(in srgb, ${palette[[...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % palette.length]} 72%, black)`
function compare(id: string) {
  if (!toggleCompare(props.kind, id)) toast(t('browse.compareLimit', { p0: format.value.number(maxCompare) }))
}
// An em dash marks "no reviews" in the narrow count column; it is a symbol, not text.
const dash = '\u2014'
const inCompare = (id: string) => compareList[props.kind].includes(id)
</script>

<template>
  <div class="stack list-page">
    <PageHeader
      :title="t(kind === 'course' ? 'nav.courses' : 'nav.teachers')"
      :description="results.status.value === 'ready' || results.items.value.length ? t(kind === 'course' ? 'browse.totalCourses' : 'browse.totalTeachers', { p0: format.number(count) }) : ''"
    />
    <div class="stack-sm toolbar">
      <div
        v-if="kind === 'course' && categories.length"
        class="d-chips"
        role="group"
        :aria-label="t('browse.courseCategory')"
      >
        <button
          class="d-chip"
          type="button"
          :aria-pressed="!applied.category"
          @click="set({ category: undefined })"
        >
          {{ t('browse.all') }} <span class="num">{{ format.number(facets.facetTotal) }}</span>
        </button>
        <button
          v-for="tab in categories"
          :key="tab.id"
          class="d-chip"
          type="button"
          :aria-pressed="applied.category === tab.id"
          @click="set({ category: tab.id })"
        >
          {{ tab.name }} <span class="num">{{ format.number(tab.count) }}</span>
        </button>
      </div>
      <div class="row filters">
        <SearchField
          v-model="text"
          :aria-label="t(kind === 'course' ? 'browse.searchCourses' : 'browse.searchTeachers')"
          :placeholder="t(kind === 'course' ? 'browse.searchCourseHint' : 'browse.searchTeacherName')"
        />
        <AppSelect
          :model-value="applied.department"
          class="select mini"
          :aria-label="t('browse.offeringDepartment')"
          @update:model-value="(value: string) => set({ department: value || undefined })"
        >
          <option value="">
            {{ t('browse.allDepartments') }}
          </option>
          <option
            v-for="d in departments"
            :key="d.id"
            :value="d.id"
          >
            {{ d.name }}
          </option>
        </AppSelect>
        <AppSelect
          :model-value="applied.sort"
          class="select mini"
          :aria-label="t('browse.sort')"
          @update:model-value="(value: string) => set({ sort: value === 'hot' ? undefined : value })"
        >
          <option value="hot">
            {{ t('browse.hottest') }}
          </option>
          <option
            v-if="kind === 'teacher'"
            value="recommend"
          >
            {{ t('browse.mostRecommended') }}
          </option>
          <option
            v-if="kind === 'course'"
            value="reviews"
          >
            {{ t('browse.mostReviews') }}
          </option>
          <option value="name">
            {{ t('browse.byName') }}
          </option>
        </AppSelect>
        <div
          v-if="kind === 'course'"
          class="d-seg view"
          role="group"
          :aria-label="t('browse.listMode')"
        >
          <button
            class="btn"
            type="button"
            :aria-pressed="!grouped"
            @click="grouped = false"
          >
            {{ t('browse.all') }}
          </button>
          <button
            class="btn"
            type="button"
            :aria-pressed="grouped"
            @click="grouped = true"
          >
            {{ t('browse.byDepartment') }}
          </button>
        </div>
      </div>
      <FilterBar
        :items="activeFilters"
        @clear-all="clear"
      />
      <span
        class="visually-hidden"
        aria-live="polite"
      >{{ results.status.value === 'ready' ? t(kind === 'course' ? 'browse.totalCourses' : 'browse.totalTeachers', { p0: format.number(count) }) : '' }}</span>
    </div>

    <PagedState
      :status="results.status.value"
      :error="results.error.value"
      :count="results.items.value.length"
      :next="results.next.value"
      :appending="results.appending.value"
      :retry-label="t(kind === 'course' ? 'academic.directory.reloadCourses' : 'academic.directory.reloadTeachers')"
      :empty-text="t(activeFilters.length ? (kind === 'course' ? 'browse.noMatchCourses' : 'browse.noMatchTeachers') : 'academic.directory.empty')"
      :total="count"
      :filtered="activeFilters.length > 0"
      @retry="results.reload"
      @more="results.loadMore"
    >
      <ul
        v-if="kind === 'teacher'"
        :key="listKey"
        class="cards d-list-in"
        :class="{ stale: results.refreshing.value }"
        :aria-busy="results.refreshing.value || undefined"
      >
        <li
          v-for="row in results.items.value"
          :key="row.object.id"
          class="card teacher-card"
        >
          <div class="row teacher">
            <span
              class="face"
              :style="{ background: tint(row.object.id) }"
              aria-hidden="true"
            >{{ row.object.name.slice(0, 1) }}</span>
            <span class="group-body">
              <RouterLink
                class="card-title"
                :to="`/teachers/${encodeURIComponent(row.object.id)}`"
              >{{ row.object.name }}</RouterLink>
              <span class="subtle">{{ row.departments[0]?.name ?? '' }}</span>
            </span>
            <FavoriteButton
              :id="row.object.id"
              kind="teacher"
              quiet
            />
          </div>
          <span
            v-if="row.object.biography"
            class="muted small clamp-2"
          >{{ row.object.biography }}</span>
          <span class="dims"><small>{{ t('browse.teacherOverallScore') }}</small><RatingLevel :level="level(row)" /></span>
          <div class="foot">
            <button
              class="btn btn-sm"
              type="button"
              @click="open(row)"
            >
              <Eye aria-hidden="true" />{{ t('browse.quickView') }}
            </button>
            <button
              class="btn btn-sm btn-ghost"
              type="button"
              :aria-pressed="inCompare(row.object.id)"
              @click="compare(row.object.id)"
            >
              <Scale aria-hidden="true" />{{ inCompare(row.object.id) ? t('browse.inCompare') : t('browse.compare') }}
            </button>
          </div>
        </li>
      </ul>
      <div
        v-else
        :key="listKey"
        class="sections d-list-in"
        :class="{ split: grouped, stale: results.refreshing.value }"
        :aria-busy="results.refreshing.value || undefined"
      >
        <section
          v-for="group in groups"
          :key="group.id"
          class="card flush"
          :aria-label="group.name || undefined"
        >
          <header
            v-if="group.id"
            class="group-head"
          >
            <h2 class="card-title">
              {{ group.name }}
            </h2>
            <span class="subtle">{{ t('browse.groupCourses', { p0: format.number(group.count), p1: reviewText(group.reviews) }) }}</span>
          </header>
          <div
            v-else
            class="line head"
            aria-hidden="true"
          >
            <span>{{ t('nav.courses') }}</span><span class="dept">{{ t('browse.department') }}</span><span>{{ t('browse.category') }}</span><span>{{ t('browse.recommendation') }}</span><span>{{ t('browse.reviews') }}</span><span />
          </div>
          <ul>
            <li
              v-for="r in visible(group)"
              :key="r.object.id"
              class="line"
              :class="{ compact: group.id }"
            >
              <span class="main">
                <RouterLink
                  class="name truncate"
                  :to="`/courses/${encodeURIComponent(r.object.id)}`"
                >{{ r.object.name }}</RouterLink>
                <span class="subtle truncate">{{ sub(r) }}</span>
                <span class="subtle phone"><span class="truncate">{{ [r.categories[0]?.name, reviewText(r.review_count)].filter(Boolean).join(' · ') }}</span><RatingLevel
                  v-if="level(r)"
                  :level="level(r)"
                /></span>
              </span>
              <template v-if="!group.id">
                <span class="cell small truncate dept">{{ r.departments[0]?.name ?? '' }}</span>
                <span class="cell"><span
                  v-if="r.categories[0]"
                  class="tag"
                >{{ r.categories[0].name }}</span></span>
              </template>
              <span
                class="cell rec"
                :class="{ none: !level(r) }"
              ><RatingLevel
                v-if="level(r)"
                :level="level(r)"
              /><template v-else>{{ dash }}</template></span>
              <span
                v-if="!group.id"
                class="cell small"
                :class="{ none: !r.review_count }"
              >{{ r.review_count ? format.number(r.review_count) : dash }}</span>
              <span class="ops">
                <button
                  class="btn btn-sm btn-icon btn-quiet desk peek"
                  type="button"
                  :aria-label="t('browse.quickViewItem', { p0: r.object.name })"
                  @click="open(r)"
                ><Eye aria-hidden="true" /></button>
                <button
                  class="btn btn-sm btn-icon btn-quiet desk"
                  type="button"
                  :aria-label="inCompare(r.object.id) ? t('browse.removeItemFromCompare', { p0: r.object.name }) : t('browse.compareItem', { p0: r.object.name })"
                  :aria-pressed="inCompare(r.object.id)"
                  @click="compare(r.object.id)"
                ><Scale aria-hidden="true" /></button>
                <FavoriteButton
                  :id="r.object.id"
                  kind="course"
                  quiet
                />
                <RowMore
                  :label="t('browse.moreActionsFor', { p0: r.object.name })"
                  :items="[{ label: t('browse.quickView'), icon: Eye, action: () => open(r) }, { label: inCompare(r.object.id) ? t('browse.removeFromCompare') : t('browse.addToCompare'), icon: Scale, action: () => compare(r.object.id) }]"
                />
              </span>
            </li>
          </ul>
          <button
            v-if="group.id && group.rows.length > PREVIEW"
            class="more"
            type="button"
            :aria-expanded="expanded.has(group.id)"
            @click="toggleGroup(group.id)"
          >
            <ChevronDown
              :class="{ flip: expanded.has(group.id) }"
              aria-hidden="true"
            />{{ expanded.has(group.id) ? t('browse.collapse') : t('browse.expandAll', { p0: format.number(group.rows.length) }) }}
          </button>
        </section>
      </div>
    </PagedState>
    <QuickView
      :id="quick?.id"
      :kind="kind"
      :name="quick?.name"
      :note="quick?.note"
      @close="quick = undefined"
    />
  </div>
</template>

<style scoped>
.list-page { gap: 1rem; }
/* The filter area stays visible on desktop. On phones it would cover too much of the list. */
@media (min-width: 761px) { .toolbar { position: sticky; inset-block-start: var(--nav-height); z-index: 30; margin-inline: -.5rem; padding: .5rem; background: var(--bg); } }
.filters { gap: .5rem; }
.mini { width: auto; min-height: 42px; padding-block: .375rem; border-radius: var(--pill); background-color: var(--surface); box-shadow: var(--shadow-card); font-size: .9375rem; flex: 1 1 8rem; }
@media (min-width: 761px) { .mini { flex: 0 1 11rem; } }
.num { margin-inline-start: .125rem; opacity: .6; font-size: .8125rem; font-variant-numeric: tabular-nums; }
.view { flex: none; margin-inline-start: auto; }
.view .btn { width: auto; padding-inline: .75rem; font-size: .8125rem; }
.cards { display: grid; gap: .875rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, max(16rem, (100% - 1.75rem) / 3)), 1fr)); }
/* Cards in a row share a height so ratings and buttons line up at the bottom. */
.teacher-card { display: flex; flex-direction: column; gap: .625rem; }
.teacher { flex-wrap: nowrap; gap: .75rem; }
.face { display: grid; flex: none; place-items: center; width: 44px; height: 44px; border-radius: 50%; color: #fff; font-weight: 600; }
.clamp-2 { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.dims { margin-block-start: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .25rem .75rem; }
.dims small { color: var(--label-2); font-size: .8125rem; }
.foot { display: flex; flex-wrap: wrap; gap: .375rem; }
/* Rows of the previous result stay while the next one loads, dimmed so they read as not current. */
.stale { opacity: .5; pointer-events: none; transition: opacity .2s .15s; }
.sections { display: grid; gap: .875rem; }
.sections.split { grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr)); align-items: start; }
.flush { min-width: 0; padding: 0; overflow: hidden; container-type: inline-size; }
.group-head { display: grid; gap: .0625rem; padding: .75rem 1rem; border-block-end: .5px solid var(--separator); background: var(--fill); }
.line { position: relative; display: grid; align-items: center; gap: .75rem; min-height: 44px; padding: .25rem 1rem; grid-template-columns: minmax(0, 1fr) 12rem 6.5rem 7.5rem 3.5rem 7.25rem; }
.line.compact { grid-template-columns: minmax(0, 1fr) auto 7.25rem; }
li.line + li.line { border-block-start: .5px solid var(--separator); }
li.line:hover { background: var(--fill); }
.head { min-height: 34px; padding-block: .25rem; border-block-end: .5px solid var(--separator); color: var(--label-3); font-size: .8125rem; }
.main { display: grid; min-width: 0; line-height: 1.3; }
.name { color: var(--label); font-size: .9375rem; font-weight: 550; }
.name::after { content: ""; position: absolute; inset: 0; }
.name:hover { color: var(--accent); text-decoration: none; }
.main .subtle { font-size: .75rem; }
.phone { display: none; }
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
.rec { display: flex; align-items: center; }
/* A narrow card drops the department column first; the name and the rating matter more. Phones have their own layout below. */
@media (min-width: 761px) {
  @container (max-width: 50rem) {
    .line:not(.compact) { grid-template-columns: minmax(0, 1fr) 6.5rem 7.5rem 3.5rem 7.25rem; }
    .dept { display: none; }
  }
  @container (max-width: 24rem) { .line.compact .rec { display: none; } }
}
.ops { position: relative; z-index: 1; display: flex; justify-content: flex-end; gap: .125rem; }
/* With a mouse the row actions appear on hover or keyboard focus. The quick view stays faintly visible so it can be found. */
@media (hover: hover) {
  .ops .btn { opacity: 0; transition: opacity .15s, background-color .2s, color .2s; }
  .ops .btn.peek { opacity: .7; }
  li.line:hover .ops .btn, li.line:focus-within .ops .btn, .ops .btn[aria-pressed="true"] { opacity: 1; }
}
.more { display: flex; align-items: center; justify-content: center; gap: .25rem; width: 100%; min-height: 40px; border: 0; border-block-start: .5px solid var(--separator); background: transparent; color: var(--accent); font: inherit; font-size: .875rem; cursor: pointer; }
.more:hover { background: var(--fill); }
.more svg { width: 1rem; height: 1rem; transition: transform .2s; }
.more svg.flip { transform: rotate(180deg); }
@media (max-width: 760px) {
  .line, .line.compact { grid-template-columns: minmax(0, 1fr) auto; }
  .head, .cell, .line.compact .rec { display: none; }
  .phone { display: flex; align-items: center; gap: .5rem; min-width: 0; }
  .phone :deep(.d-level) { flex: none; font-size: .75rem; }
  .name { white-space: normal; }
  .line { padding: .5rem .875rem; }
  .ops .btn { opacity: 1; }
  .ops .desk { display: none; }
}
</style>
