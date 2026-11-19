<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import CollapseSection from '../../shared/ui/CollapseSection.vue'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import { useAcademic, type CatalogObject, type Statistics } from './api'
import RatingBands from './RatingBands.vue'
import { recommendationLevel } from './ratings/levels'
import RatingDistribution from './ratings/RatingDistribution.vue'
import RatingTrend from './ratings/RatingTrend.vue'

// Course statistics use every visible review of the course. Teacher statistics
// average course means of reviews attributed to the teacher, one course at a time.
const props = defineProps<{ kind: 'course' | 'teacher'; targetId: string; schoolId: string }>()
const { t } = useI18n()
const format = useFormat()
const api = useAcademic()
const range = ref<'all' | '30' | '365'>('all')
const courses = shallowRef<Statistics['courses']>([])
const names = shallowRef(new Map<string, CatalogObject>())
const next = ref('')
const moreError = ref('')
const loadingMore = ref(false)

function period() {
  if (range.value === 'all') return {}
  const until = new Date()
  return { from: new Date(until.getTime() - Number(range.value) * 86_400_000).toISOString(), until: until.toISOString() }
}

let continuation: AbortController | undefined
onBeforeUnmount(() => continuation?.abort())
const summary = useAsync(async (signal) => {
  continuation?.abort()
  loadingMore.value = false
  const stats = await api.statistics({ kind: props.kind, target_id: props.targetId, ...period() }, signal)
  const found = await api.lookup(stats.courses.map((row) => row.course_id), signal)
  signal.throwIfAborted()
  names.value = found
  courses.value = stats.courses
  next.value = stats.next
  return stats
})

const charts = useAsync(async (signal) => {
  if (range.value !== 'all') return undefined
  return (await api.summaries(props.kind, [props.targetId], true, signal)).items[0]
})

const recommendation = computed(() => recommendationLevel[charts.data.value?.recommendation ?? 'unrated'])
const distribution = computed(() => (charts.data.value?.review_count ? charts.data.value.distribution?.[0] : undefined))
const trendTerms = computed(() => {
  if (!charts.data.value?.review_count) return []
  const list = [...(charts.data.value.terms ?? [])]
  if (list.some((term) => typeof term.term_order_key === 'number')) {
    list.sort((a, b) => (a.term_order_key || Number.MAX_SAFE_INTEGER) - (b.term_order_key || Number.MAX_SAFE_INTEGER) || a.term_id.localeCompare(b.term_id))
  }
  return list.map((term) => ({ name: term.term_name, level: recommendationLevel[term.recommendation], samples: term.review_count }))
})

function refreshAll() {
  void summary.reload()
  void charts.reload()
}

async function more() {
  if (!next.value || loadingMore.value) return
  const controller = new AbortController()
  continuation = controller
  loadingMore.value = true
  moreError.value = ''
  try {
    const stats = await api.statistics({ kind: props.kind, target_id: props.targetId, after: next.value, ...period() }, controller.signal)
    const found = await api.lookup(stats.courses.map((row) => row.course_id), controller.signal)
    if (controller.signal.aborted) return
    names.value = new Map([...names.value, ...found])
    courses.value = [...courses.value, ...stats.courses]
    next.value = stats.next !== next.value ? stats.next : ''
  } catch (failure) {
    if (!controller.signal.aborted) moreError.value = errorCode(failure)
  } finally {
    if (continuation === controller) loadingMore.value = false
  }
}

watch(range, refreshAll)
watch(() => [props.kind, props.targetId], () => {
  range.value = 'all'
  refreshAll()
})
onMounted(refreshAll)
defineExpose({ refresh: refreshAll })
</script>

<template>
  <section class="section">
    <div class="section-head">
      <h2>{{ t('academic.stats.title') }}</h2>
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
    </div>
    <p class="small muted">
      {{ t(kind === 'teacher' ? 'academic.stats.teacherScope' : 'academic.stats.courseScope') }}
    </p>
    <AsyncState
      skeleton="bands"
      :status="summary.status.value"
      :error="summary.error.value"
      @retry="summary.reload"
    >
      <template v-if="summary.data.value">
        <p
          v-if="summary.data.value.from && summary.data.value.until"
          class="subtle"
        >
          {{ t('academic.stats.period', { from: format.date(summary.data.value.from), until: format.date(summary.data.value.until) }) }}
        </p>
        <RatingBands
          :bands="summary.data.value.dimensions"
          :school-id="schoolId"
          :show-courses="kind === 'teacher'"
        />
        <div
          v-if="range === 'all' && (distribution || trendTerms.length)"
          class="stats-charts"
        >
          <section
            v-if="distribution"
            class="card stack-sm chart-card"
          >
            <h3 class="d-title">
              {{ t('browse.recommendationDist') }}
            </h3>
            <RatingDistribution
              :weights="distribution.weights"
              :samples="distribution.samples"
              :level="recommendation"
            />
          </section>
          <section
            v-if="trendTerms.length"
            class="card stack-sm chart-card"
          >
            <h3 class="d-title">
              {{ t('browse.trendByTerm') }}
            </h3>
            <RatingTrend :terms="trendTerms" />
          </section>
        </div>
        <CollapseSection
          v-if="kind === 'teacher' && courses.length"
          :label="t('academic.stats.byCourse')"
        >
          <div class="stack">
            <ul class="list">
              <li
                v-for="row in courses"
                :key="row.course_id"
                class="card stack-sm"
              >
                <RouterLink :to="`/courses/${encodeURIComponent(row.course_id)}`">
                  {{ names.get(row.course_id)?.name ?? t('common.unknown') }}
                </RouterLink>
                <RatingBands
                  :bands="row.dimensions"
                  :school-id="schoolId"
                  :samples="false"
                  compact
                />
              </li>
            </ul>
            <ErrorNotice
              v-if="moreError"
              :code="moreError"
              @retry="more"
            />
            <button
              v-else-if="next"
              class="btn"
              type="button"
              :disabled="loadingMore"
              @click="more"
            >
              {{ t('common.loadMore') }}
            </button>
          </div>
        </CollapseSection>
      </template>
    </AsyncState>
  </section>
</template>

<style scoped>
.range { width: auto; min-height: 34px; }
.stats-charts { display: grid; gap: .875rem; grid-template-columns: minmax(0, 1fr); }
.chart-card { min-width: 0; overflow: hidden; }
@media (min-width: 720px) {
  .stats-charts { grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); align-items: start; }
}
</style>
