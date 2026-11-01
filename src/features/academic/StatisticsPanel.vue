<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { onMounted, ref, shallowRef, watch } from 'vue'
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

const summary = useAsync(async (signal) => {
  const stats = await api.statistics({ kind: props.kind, target_id: props.targetId, ...period() }, signal)
  names.value = await api.lookup(stats.courses.map((row) => row.course_id), signal)
  courses.value = stats.courses
  next.value = stats.next
  return stats
})

async function more() {
  if (!next.value || loadingMore.value) return
  loadingMore.value = true
  moreError.value = ''
  try {
    const stats = await api.statistics({ kind: props.kind, target_id: props.targetId, after: next.value, ...period() })
    const found = await api.lookup(stats.courses.map((row) => row.course_id))
    names.value = new Map([...names.value, ...found])
    courses.value = [...courses.value, ...stats.courses]
    next.value = stats.next !== next.value ? stats.next : ''
  } catch (failure) {
    moreError.value = errorCode(failure)
  } finally {
    loadingMore.value = false
  }
}

watch(range, () => void summary.reload())
watch(() => [props.kind, props.targetId], () => {
  range.value = 'all'
  void summary.reload()
})
onMounted(summary.reload)
defineExpose({ refresh: summary.reload })
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
</style>
