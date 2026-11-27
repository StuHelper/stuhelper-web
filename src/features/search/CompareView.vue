<script setup lang="ts">
import { subjectPath as pathOf, teacherPath } from '../academic/paths'
import { Plus, Scale, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { ApiError } from '../../shared/api/errors'
import { useErrorText } from '../../shared/ui/messages'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import SearchField from '../../shared/ui/SearchField.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { toast } from '../../shared/ui/toast'
import { useCampusId } from '../account/access'
import { dimensions, knownCredits, useAcademic, type CatalogObject, type ObjectSummary, type Statistics } from '../academic/api'
import { useRatingText } from '../academic/presentation'
import RatingIcon from '../academic/RatingIcon.vue'
import { clearCompare, compareList, maxCompare, toggleCompare, type CompareKind } from './compare'

// Side-by-side facts and ratings for up to five courses or teachers. Each column reads
// the same public summary and review statistics the subject page shows, over one shared
// time range, so the columns are comparable. Exact averages are never shown.
type CompareColumn = {
  id: string
  name: string
  stats?: Statistics
  error?: string
  summary?: ObjectSummary
  teachers: CatalogObject[]
}

const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const route = useRoute()
const router = useRouter()
const api = useAcademic()
const campus = useCampusId()
// Rating wording follows the served school's configuration, like the subject pages.
const text = useRatingText(computed(() => campus.value || undefined))

const kind = computed<CompareKind>({
  get: () => (route.query.kind === 'teacher' ? 'teacher' : 'course'),
  set: (value) => void router.replace({ query: { ...route.query, kind: value === 'course' ? undefined : value } }),
})
const range = ref<'all' | '365' | '30'>('all')
const ids = computed(() => [...compareList[kind.value]])
const tabs = computed(() => [
  { value: 'course' as const, label: t('search.compare.courses', { count: format.value.number(compareList.course.length) }) },
  { value: 'teacher' as const, label: t('search.compare.teachers', { count: format.value.number(compareList.teacher.length) }) },
])

const pickerQuery = ref('')
const pickerItems = shallowRef<CatalogObject[]>([])
const pickerBusy = ref(false)
const pickerSearched = ref(false)
let pickerTimer: ReturnType<typeof setTimeout> | undefined
let pickerAbort: AbortController | undefined

function stopPicker() {
  if (pickerTimer) clearTimeout(pickerTimer)
  pickerTimer = undefined
  pickerAbort?.abort()
  pickerAbort = undefined
}

watch(kind, () => {
  stopPicker()
  pickerQuery.value = ''
  pickerItems.value = []
  pickerBusy.value = false
  pickerSearched.value = false
})

watch(pickerQuery, (raw) => {
  stopPicker()
  const q = raw.trim()
  if (!q) {
    pickerItems.value = []
    pickerBusy.value = false
    pickerSearched.value = false
    return
  }
  pickerBusy.value = true
  pickerTimer = setTimeout(() => {
    const controller = new AbortController()
    pickerAbort = controller
    void api.directory({ kind: kind.value, school_id: campus.value || undefined, q, limit: 8 }, controller.signal)
      .then((page) => {
        if (pickerAbort !== controller) return
        pickerItems.value = page.items.map((row) => row.object)
        pickerSearched.value = true
      })
      .catch(() => {
        if (pickerAbort !== controller) return
        pickerItems.value = []
        pickerSearched.value = true
      })
      .finally(() => {
        if (pickerAbort === controller) pickerBusy.value = false
      })
  }, 160)
})
onBeforeUnmount(stopPicker)

const availablePicks = computed(() => pickerItems.value.filter((item) => !ids.value.includes(item.id)))

function addPick(id: string) {
  if (!toggleCompare(kind.value, id)) {
    toast(t('search.compare.full', { max: format.value.number(maxCompare) }))
    return
  }
  if (ids.value.length >= maxCompare) pickerQuery.value = ''
}

function period() {
  if (range.value === 'all') return {}
  const until = new Date()
  return { from: new Date(until.getTime() - Number(range.value) * 86_400_000).toISOString(), until: until.toISOString() }
}
const data = useAsync<CompareColumn[]>(async (signal) => {
  const list = ids.value
  const [names, stats, summaries, courseTeachers] = await Promise.all([
    api.lookup(list, signal),
    Promise.all(list.map((id) => api.statistics({ kind: kind.value, target_id: id, ...period() }, signal).then(stats => ({ stats, error: '' })).catch((error: unknown) => {
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return { stats: undefined, error: error.code }
      throw error
    }))),
    Promise.all(list.map((id) => api.summary(id, signal).catch((): ObjectSummary | undefined => undefined))),
    kind.value === 'course'
      ? Promise.all(list.map((id) => api.objects({ kind: 'teacher', course_id: id, limit: 12 }, signal).then((page) => page.items).catch((): CatalogObject[] => [])))
      : Promise.resolve(list.map((): CatalogObject[] => [])),
  ])
  return list.map((id, index) => ({
    id,
    name: summaries[index]?.object.name ?? names.get(id)?.name ?? t('common.unknown'),
    ...stats[index],
    summary: summaries[index],
    teachers: courseTeachers[index] ?? [],
  }))
})
watch([ids, range], () => {
  if (ids.value.length) void data.reload()
}, { immediate: true })

const periodSpan = computed(() => {
  const match = data.data.value?.find((item) => item.stats?.from && item.stats.until)?.stats
  return match?.from && match.until ? { from: match.from, until: match.until } : undefined
})

function courseCredits(item: CompareColumn) {
  if (!item.summary) return t('common.notProvided')
  const credits = knownCredits(item.summary.object)
  return credits === undefined ? t('academic.subject.creditsUnknown') : format.value.number(credits)
}

function courseNatures(item: CompareColumn) {
  if (!item.summary) return t('common.notProvided')
  const tags = [...item.summary.categories, ...item.summary.natures].map((entry) => entry.name).filter(Boolean)
  return tags.length ? format.value.list([...new Set(tags)]) : t('common.notProvided')
}

// Higher is better for recommendation, quality and grading; difficulty and
// workload have no better side, and a tie marks nothing.
function best(index: number) {
  const items = data.data.value ?? []
  if (index === 2 || index === 3 || items.length < 2) return 0
  const levels = items.map((item) => item.stats?.dimensions[index]?.level ?? 0).filter((level) => level > 0)
  return levels.length > 1 && Math.min(...levels) !== Math.max(...levels) ? Math.max(...levels) : 0
}
const subjectPath = (id: string) => pathOf(kind.value, id)
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :title="t('search.compare.title')"
      :description="t('search.compare.description', { max: format.number(maxCompare) })"
    >
      <template #actions>
        <label class="row small">
          <span>{{ t('academic.stats.range') }}</span>
          <AppSelect
            v-model="range"
            class="select range"
          >
            <option value="all">{{ t('academic.stats.rangeAll') }}</option>
            <option value="365">{{ t('academic.stats.rangeYear') }}</option>
            <option value="30">{{ t('academic.stats.rangeMonth') }}</option>
          </AppSelect>
        </label>
        <button
          v-if="ids.length"
          class="btn btn-sm"
          type="button"
          @click="clearCompare(kind)"
        >
          {{ t('search.compare.clear') }}
        </button>
      </template>
    </PageHeader>
    <TabBar
      v-model="kind"
      :tabs="tabs"
      :label="t('search.compare.kind')"
      id-prefix="compare"
    />
    <section
      v-if="ids.length < maxCompare"
      class="card stack-sm picker"
      :aria-label="t(kind === 'course' ? 'search.compare.addCourse' : 'search.compare.addTeacher')"
    >
      <SearchField
        v-model="pickerQuery"
        :aria-label="t(kind === 'course' ? 'search.compare.addCourse' : 'search.compare.addTeacher')"
        :placeholder="t(kind === 'course' ? 'browse.searchCourseHint' : 'browse.searchTeacherName')"
      />
      <p
        v-if="pickerBusy"
        class="subtle small"
        role="status"
      >
        {{ t('search.searching') }}
      </p>
      <ul
        v-else-if="availablePicks.length"
        class="group"
      >
        <li
          v-for="option in availablePicks"
          :key="option.id"
          class="group-row"
        >
          <span class="group-body">
            <span class="group-title">{{ option.name }}</span>
            <span
              v-if="option.code"
              class="subtle mono"
            >{{ option.code }}</span>
          </span>
          <button
            class="btn btn-sm"
            type="button"
            @click="addPick(option.id)"
          >
            <Plus aria-hidden="true" />{{ t('search.compare.add') }}
          </button>
        </li>
      </ul>
      <p
        v-else-if="pickerSearched && pickerQuery.trim()"
        class="subtle small"
      >
        {{ t('search.noMatch') }}
      </p>
    </section>
    <div
      id="compare-panel"
      role="tabpanel"
      :aria-labelledby="`compare-tab-${kind}`"
    >
      <div
        v-if="!ids.length"
        class="card empty"
      >
        <Scale aria-hidden="true" />
        <h2>{{ t('search.compare.emptyTitle') }}</h2>
        <p class="muted small">
          {{ t('search.compare.emptyHint') }}
        </p>
        <RouterLink
          class="btn"
          :to="kind === 'course' ? '/courses' : '/teachers'"
        >
          {{ t(kind === 'course' ? 'search.compare.browseCourses' : 'search.compare.browseTeachers') }}
        </RouterLink>
      </div>
      <AsyncState
        v-else
        :status="data.status.value"
        :error="data.error.value"
        @retry="data.reload"
      >
        <p
          v-if="periodSpan"
          class="subtle small"
        >
          {{ t('academic.stats.period', { from: format.date(periodSpan.from), until: format.date(periodSpan.until) }) }}
        </p>
        <div
          v-if="data.data.value"
          class="card flush"
        >
          <div class="scroll">
            <table>
              <thead>
                <tr>
                  <th
                    scope="col"
                    class="dim"
                  >
                    <span class="visually-hidden">{{ t('search.compare.dimension') }}</span>
                  </th>
                  <th
                    v-for="item in data.data.value"
                    :key="item.id"
                    scope="col"
                  >
                    <div class="head">
                      <RouterLink
                        class="card-title"
                        :to="subjectPath(item.id)"
                      >
                        {{ item.name }}
                      </RouterLink>
                      <span
                        v-if="item.error"
                        class="small"
                      >{{ errorText(item.error) }}</span>
                      <button
                        class="btn btn-sm btn-icon"
                        type="button"
                        :aria-label="t('search.compare.remove', { name: item.name })"
                        @click="toggleCompare(kind, item.id)"
                      >
                        <X aria-hidden="true" />
                      </button>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th
                    scope="row"
                    class="dim"
                  >
                    {{ t(kind === 'course' ? 'academic.directory.college' : 'academic.directory.department') }}
                  </th>
                  <td
                    v-for="item in data.data.value"
                    :key="item.id"
                    class="small"
                  >
                    {{ item.summary?.department?.name || t('common.notProvided') }}
                  </td>
                </tr>
                <template v-if="kind === 'course'">
                  <tr>
                    <th
                      scope="row"
                      class="dim"
                    >
                      {{ t('academic.subject.creditsLabel') }}
                    </th>
                    <td
                      v-for="item in data.data.value"
                      :key="item.id"
                      class="small"
                    >
                      {{ courseCredits(item) }}
                    </td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      class="dim"
                    >
                      {{ t('academic.directory.nature') }}
                    </th>
                    <td
                      v-for="item in data.data.value"
                      :key="item.id"
                      class="small"
                    >
                      {{ courseNatures(item) }}
                    </td>
                  </tr>
                  <tr>
                    <th
                      scope="row"
                      class="dim"
                    >
                      {{ t('academic.subject.teachers') }}
                    </th>
                    <td
                      v-for="item in data.data.value"
                      :key="item.id"
                      class="small"
                    >
                      <div
                        v-if="item.teachers.length"
                        class="teacher-links"
                      >
                        <RouterLink
                          v-for="teacher in item.teachers"
                          :key="teacher.id"
                          :to="teacherPath(teacher)"
                        >
                          {{ teacher.name }}
                        </RouterLink>
                      </div>
                      <span
                        v-else
                        class="subtle"
                      >{{ t('common.notProvided') }}</span>
                    </td>
                  </tr>
                </template>
                <tr v-else>
                  <th
                    scope="row"
                    class="dim"
                  >
                    {{ t('search.compare.taughtCourses') }}
                  </th>
                  <td
                    v-for="item in data.data.value"
                    :key="item.id"
                    class="small"
                  >
                    {{ item.summary ? format.number(item.summary.course_count) : t('common.notProvided') }}
                  </td>
                </tr>
                <tr
                  v-for="(name, index) in dimensions"
                  :key="name"
                >
                  <th
                    scope="row"
                    class="dim"
                  >
                    {{ text(index, 0) }}
                  </th>
                  <td
                    v-for="item in data.data.value"
                    :key="item.id"
                    :class="{ best: best(index) > 0 && item.stats?.dimensions[index]?.level === best(index) }"
                  >
                    <span
                      v-if="(item.stats?.dimensions[index]?.level ?? 0) > 0"
                      class="level"
                    >
                      <RatingIcon
                        :dimension="index"
                        :level="item.stats?.dimensions[index]?.level ?? 0"
                      />{{ text(index, item.stats?.dimensions[index]?.level ?? 0) }}
                    </span>
                    <span
                      v-else
                      class="subtle"
                    >{{ (item.stats?.dimensions[index]?.samples ?? 0) > 0 ? t('academic.ratings.insufficient') : t('search.compare.noReviews') }}</span>
                  </td>
                </tr>
                <tr v-if="kind === 'teacher'">
                  <th
                    scope="row"
                    class="dim"
                  >
                    {{ t('search.compare.ratedCourses') }}
                  </th>
                  <td
                    v-for="item in data.data.value"
                    :key="item.id"
                    class="small"
                  >
                    {{ item.stats ? format.number(item.stats.dimensions[0]?.courses ?? 0) : t('common.unknown') }}
                  </td>
                </tr>
                <tr>
                  <th
                    scope="row"
                    class="dim"
                  >
                    {{ t('search.compare.samples') }}
                  </th>
                  <td
                    v-for="item in data.data.value"
                    :key="item.id"
                    class="small"
                  >
                    {{ item.stats ? t('academic.ratings.samplesOnly', { samples: format.number(item.stats.dimensions[0]?.samples ?? 0) }) : t('common.unknown') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="subtle small">
          {{ t('search.compare.note') }}
        </p>
      </AsyncState>
    </div>
  </div>
</template>

<style scoped>
.range { width: auto; min-height: 34px; }
.picker { padding: .875rem 1rem; }
.empty { display: grid; justify-items: center; gap: .5rem; padding-block: 2.5rem; text-align: center; }
.empty > svg { width: 2rem; height: 2rem; color: var(--label-3); }
.flush { padding: 0; overflow: hidden; }
.scroll { overflow-x: auto; }
table { width: 100%; min-width: 34rem; border-collapse: collapse; }
th, td { padding: .75rem 1rem; border-block-end: .5px solid var(--separator); text-align: start; font-weight: 400; vertical-align: middle; }
tr:last-child > * { border-block-end: 0; }
.dim { width: 7.5rem; color: var(--label-3); font-size: .8125rem; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }
.level { display: inline-flex; align-items: center; gap: .375rem; }
.teacher-links { display: flex; flex-wrap: wrap; gap: .25rem .625rem; }
.best { background: var(--accent-soft); }
</style>
