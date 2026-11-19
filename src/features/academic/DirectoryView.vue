<script setup lang="ts">
import { Eye, Scale } from 'lucide-vue-next'
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
import SearchField from '../../shared/ui/SearchField.vue'
import { toast } from '../../shared/ui/toast'
import { useCampusId } from '../account/access'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import { compareList, maxCompare, toggleCompare } from '../search/compare'
import { knownCredits, useAcademic, type DirectoryFacet, type DirectoryItem, type DirectorySort } from './api'
import DirectoryCourseRows from './DirectoryCourseRows.vue'
import DirectoryGroup from './DirectoryGroup.vue'
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
// Scrolling reads the next page well before the end, so larger pages only cut the number of
// requests. The grouped view reads rows per department and needs only the facets here.
const pageSize = computed(() => (props.kind === 'teacher' ? 100 : grouped.value ? 1 : 50))
const query = (after: string, overrides: Record<string, string | number | undefined> = {}) => {
  const f = applied.value
  return { kind: props.kind, school_id: campus.value, q: f.q || undefined, category_id: f.category || undefined, department_id: f.department || undefined, teacher_id: f.teacher || undefined, sort: f.sort, after: after || undefined, limit: pageSize.value, ...overrides }
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

watch(() => `${props.kind} ${campus.value} ${pageSize.value} ${JSON.stringify(applied.value)}`, () => {
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

// The grouped view lists every department of the current result. Each department reads its own
// rows, so the header counts and "show all" always cover the whole department.
const PREVIEW = 5
const groups = computed(() => facets.value.departments.filter((f) => f.count > 0).map((f) => ({ id: f.id, name: f.name, count: f.count, reviews: f.review_count })))
// Department facets can overlap. Keep a route to every result without inferring an
// unassigned count from those non-exclusive totals.
async function loadDepartment(id: string, after: string, limit: number, signal: AbortSignal) {
  const result = await api.directory(query(after, { department_id: id, limit }), signal)
  return { items: result.items, next: result.next }
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
      :next="grouped && kind === 'course' ? '' : results.next.value"
      auto
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
            >{{ [...row.object.name][0] }}</span>
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
        v-else-if="grouped"
        :key="listKey"
        class="sections split d-list-in"
        :class="{ stale: results.refreshing.value }"
        :aria-busy="results.refreshing.value || undefined"
      >
        <DirectoryGroup
          v-for="group in groups"
          :key="group.id"
          v-slot="{ rows }"
          :name="group.name"
          :count="group.count"
          :summary="t('browse.groupCourses', { p0: format.number(group.count), p1: reviewText(group.reviews) })"
          :preview="PREVIEW"
          :load="(after, limit, signal) => loadDepartment(group.id, after, limit, signal)"
        >
          <DirectoryCourseRows
            :rows="rows"
            compact
            @open="open"
            @compare="compare"
          />
        </DirectoryGroup>
        <p
          class="card unassigned"
        >
          <span class="subtle">{{ t('browse.unassignedCourses') }}</span>
          <button
            class="btn btn-sm"
            type="button"
            @click="grouped = false"
          >
            {{ t('browse.showInList') }}
          </button>
        </p>
      </div>
      <div
        v-else
        :key="listKey"
        class="sections d-list-in"
        :class="{ stale: results.refreshing.value }"
        :aria-busy="results.refreshing.value || undefined"
      >
        <section class="card flush">
          <DirectoryCourseRows
            :rows="results.items.value"
            @open="open"
            @compare="compare"
          />
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
.unassigned { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
.sections.split { grid-template-columns: repeat(auto-fill, minmax(min(100%, 26rem), 1fr)); align-items: start; }
.flush { min-width: 0; padding: 0; overflow: hidden; container-type: inline-size; }
</style>
