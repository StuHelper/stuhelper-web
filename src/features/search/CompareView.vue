<script setup lang="ts">
import { Scale, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import AppSelect from '../../shared/ui/AppSelect.vue'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { useCampusId } from '../account/access'
import { dimensions, useAcademic, type Statistics } from '../academic/api'
import { useRatingText } from '../academic/presentation'
import RatingIcon from '../academic/RatingIcon.vue'
import { compareList, maxCompare, toggleCompare, type CompareKind } from './compare'

// Side-by-side ratings for up to five courses or teachers. Each column reads the
// same reviews statistics the subject page shows, over one shared time range,
// so the columns are comparable. Exact averages are never shown.
const { t } = useI18n()
const format = useFormat()
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

function period() {
  if (range.value === 'all') return {}
  const until = new Date()
  return { from: new Date(until.getTime() - Number(range.value) * 86_400_000).toISOString(), until: until.toISOString() }
}
const data = useAsync(async (signal) => {
  const list = ids.value
  const [names, stats] = await Promise.all([
    api.lookup(list, signal),
    Promise.all(list.map((id) => api.statistics({ kind: kind.value, target_id: id, ...period() }, signal))),
  ])
  return list.map((id, index) => ({ id, name: names.get(id)?.name ?? t('common.unknown'), stats: stats[index] as Statistics }))
})
watch([ids, range], () => {
  if (ids.value.length) void data.reload()
}, { immediate: true })

// Higher is better for recommendation, quality and grading; difficulty and
// workload have no better side, and a tie marks nothing.
function best(index: number) {
  const items = data.data.value ?? []
  if (index === 2 || index === 3 || items.length < 2) return 0
  const levels = items.map((item) => item.stats.dimensions[index]?.level ?? 0).filter((level) => level > 0)
  return levels.length > 1 && Math.min(...levels) !== Math.max(...levels) ? Math.max(...levels) : 0
}
const subjectPath = (id: string) => `/${kind.value === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(id)}`
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
      </template>
    </PageHeader>
    <TabBar
      v-model="kind"
      :tabs="tabs"
      :label="t('search.compare.kind')"
      id-prefix="compare"
    />
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
                  :class="{ best: best(index) > 0 && item.stats.dimensions[index]?.level === best(index) }"
                >
                  <span
                    v-if="(item.stats.dimensions[index]?.level ?? 0) > 0"
                    class="level"
                  >
                    <RatingIcon
                      :dimension="index"
                      :level="item.stats.dimensions[index]?.level ?? 0"
                    />{{ text(index, item.stats.dimensions[index]?.level ?? 0) }}
                  </span>
                  <span
                    v-else
                    class="subtle"
                  >{{ (item.stats.dimensions[index]?.samples ?? 0) > 0 ? t('academic.ratings.insufficient') : t('search.compare.noReviews') }}</span>
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
                  {{ t('academic.ratings.samplesOnly', { samples: format.number(item.stats.dimensions[0]?.samples ?? 0) }) }}
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
</template>

<style scoped>
.range { width: auto; min-height: 34px; }
.empty { display: grid; justify-items: center; gap: .5rem; padding-block: 2.5rem; text-align: center; }
.empty > svg { width: 2rem; height: 2rem; color: var(--label-3); }
.flush { padding: 0; overflow: hidden; }
.scroll { overflow-x: auto; }
table { width: 100%; min-width: 34rem; border-collapse: collapse; }
th, td { padding: .75rem 1rem; border-block-end: .5px solid var(--separator); text-align: start; font-weight: 400; vertical-align: middle; }
tr:last-child > * { border-block-end: 0; }
.dim { width: 7rem; color: var(--label-3); font-size: .8125rem; }
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: .5rem; }
.level { display: inline-flex; align-items: center; gap: .375rem; }
.best { background: var(--accent-soft); }
</style>
