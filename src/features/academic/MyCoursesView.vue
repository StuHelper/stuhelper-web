<script setup lang="ts">
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { withFilters } from '../../shared/pageFilters'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { useErrorText } from '../../shared/ui/messages'
import { toast } from '../../shared/ui/toast'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic, type OwnSchedule } from './api'
import { arrange, currentWeek, timetableOf, todayInTerm, weekDates } from './schedule'
import ScheduleWeek from './ScheduleWeek.vue'

// Personal timetable by term, from trusted enrollment records. Structured
// meetings fill the week grid; meetings whose time could not be read keep the
// school's original text, and missing facts stay visibly missing.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useAcademic()
const term = ref('')
const mode = ref<'week' | 'list'>('week')
const week = ref(1)
const exporting = ref(false)
const exportError = ref('')

const enrollments = useAsync(async (signal) => {
  const rows = (await api.myEnrollments(signal)).filter((row) => row.active)
  const names = await api.lookup(rows.flatMap((row) => [row.term_id, ...row.teacher_ids]), signal)
  return { rows, names }
})
const terms = computed(() => {
  // Newest term first, by term_order_key (year × 10 + season; 0 for an unknown term,
  // which sorts last). Servers without the key keep the order they return, reversed,
  // because enrollments then arrive oldest term first.
  const rows = enrollments.data.value?.rows ?? []
  const keyed = rows.some((row) => typeof row.term_order_key === 'number')
  const keys = new Map(rows.map((row) => [row.term_id, row.term_order_key ?? 0]))
  const seen = keyed
    ? [...new Set(rows.map((row) => row.term_id))].sort((a, b) => (keys.get(b) ?? 0) - (keys.get(a) ?? 0) || a.localeCompare(b))
    : [...new Set(rows.map((row) => row.term_id))].reverse()
  return seen.map((value) => ({ value, label: enrollments.data.value?.names.get(value)?.name ?? t('academic.offerings.unknownTerm') }))
})
const schedule = useAsync<OwnSchedule[]>((signal) => api.mySchedule(term.value, signal))
const rows = computed(() => schedule.data.value ?? [])
const arranged = computed(() => arrange(rows.value))
const timetable = computed(() => timetableOf(rows.value))
const lastWeek = computed(() => Math.max(1, ...arranged.value.lessons.flatMap((lesson) => lesson.weeks)))
const fetched = computed(() => rows.value.map((row) => row.enrollment.fetched_at).filter((value): value is string => !!value).sort().at(-1))
// A term whose times are all plain text has nothing to put on the grid, so it opens as a list.
const gridless = computed(() => rows.value.length > 0 && arranged.value.lessons.length === 0)
const view = computed(() => (gridless.value ? 'list' : mode.value))

// Today within the shown term. The week picker offers a way back to it, and the grid marks the day.
const today = computed(() => {
  const now = todayInTerm(timetable.value)
  return now && now.week <= lastWeek.value ? now : undefined
})
const dates = computed(() => weekDates(timetable.value, week.value))
const range = computed(() => {
  const first = dates.value[0]
  const last = dates.value[6]
  // 04:00 UTC is noon at the school, so both ends keep their calendar date. The year is left out to stay short.
  const short = (date: string) => format.value.date(`${date}T04:00:00Z`, { month: 'short', day: 'numeric' })
  return first && last ? `${short(first)} – ${short(last)}` : ''
})

watch(terms, (list) => {
  if (!list.some((item) => item.value === term.value)) term.value = list[0]?.value ?? ''
})
watch(term, (value) => {
  exportError.value = ''
  if (value) void schedule.reload()
})
watch(schedule.data, () => {
  week.value = currentWeek(timetable.value, lastWeek.value)
})
onMounted(enrollments.reload)

const teacher = (id: string) => enrollments.data.value?.names.get(id)?.name
async function exportCalendar() {
  if (exporting.value) return
  exporting.value = true
  exportError.value = ''
  try {
    await api.scheduleCalendar(term.value)
    toast(t('courses.exported'))
  } catch (failure) {
    exportError.value = errorCode(failure)
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <MeLayout
    :title="t('courses.title')"
    :description="t('courses.intro')"
  >
    <AsyncState
      :status="enrollments.status.value"
      :error="enrollments.error.value"
      :empty="!enrollments.data.value?.rows.length"
      :empty-text="t('courses.empty')"
      :retry-label="t('courses.reload')"
      @retry="enrollments.reload"
    >
      <div class="stack">
        <div class="row-between wrap">
          <TabBar
            v-if="terms.length"
            v-model="term"
            :tabs="terms"
            :label="t('academic.feed.term')"
            id-prefix="my-courses"
          />
          <TabBar
            v-if="!gridless"
            v-model="mode"
            :tabs="[{ value: 'week' as const, label: t('courses.weekView') }, { value: 'list' as const, label: t('courses.listView') }]"
            :label="t('courses.viewMode')"
            id-prefix="my-courses-mode"
          />
        </div>
        <div
          id="my-courses-panel"
          role="tabpanel"
          :aria-labelledby="`my-courses-tab-${term}`"
          class="stack"
        >
          <AsyncState
            :status="schedule.status.value"
            :error="schedule.error.value"
            :empty="!rows.length"
            :empty-text="t('courses.emptyTerm')"
            @retry="schedule.reload"
          >
            <div class="stack">
              <div class="row-between wrap">
                <div
                  v-if="view === 'week'"
                  class="row picker"
                  role="group"
                  :aria-label="t('courses.weekPicker')"
                >
                  <button
                    class="btn btn-sm btn-icon"
                    type="button"
                    :disabled="week <= 1"
                    :aria-label="t('courses.prevWeek')"
                    @click="week -= 1"
                  >
                    <ChevronLeft
                      class="flip-rtl"
                      aria-hidden="true"
                    />
                  </button>
                  <span
                    class="picker-week"
                    aria-live="polite"
                  ><b>{{ t('courses.weekNumber', { week: format.number(week) }) }}</b><small
                    v-if="range"
                    class="subtle"
                  >{{ range }}</small></span>
                  <button
                    class="btn btn-sm btn-icon"
                    type="button"
                    :disabled="week >= lastWeek"
                    :aria-label="t('courses.nextWeek')"
                    @click="week += 1"
                  >
                    <ChevronRight
                      class="flip-rtl"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    v-if="today && today.week !== week"
                    class="btn btn-sm btn-ghost"
                    type="button"
                    @click="week = today.week"
                  >
                    {{ t('courses.thisWeek') }}
                  </button>
                </div>
                <p
                  v-else-if="gridless"
                  class="small muted gridless"
                >
                  {{ t('courses.textOnly') }}
                </p>
                <span v-else />
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="exporting"
                  :aria-busy="exporting || undefined"
                  @click="exportCalendar"
                >
                  <CalendarPlus aria-hidden="true" />{{ t('courses.exportCalendar') }}
                </button>
              </div>
              <p
                v-if="exportError"
                class="notice notice-warning"
                role="alert"
              >
                {{ errorText(exportError) }}
              </p>
              <ScheduleWeek
                v-if="view === 'week'"
                :lessons="arranged.lessons"
                :timetable="timetable"
                :week="week"
                :dates="dates"
                :today="today && today.week === week ? today.weekday : undefined"
              />
              <section
                v-if="view === 'week' && arranged.unplaced.length"
                class="stack-sm"
              >
                <h2 class="small">
                  {{ t('courses.unplaced') }}
                </h2>
                <ul class="list">
                  <li
                    v-for="item in arranged.unplaced"
                    :key="`${item.courseId}:${item.meeting.id}`"
                    class="card small"
                  >
                    <RouterLink :to="`/courses/${encodeURIComponent(item.courseId)}`">
                      {{ item.course }}
                    </RouterLink>
                    · {{ item.meeting.time_text || t('common.notProvided') }} · {{ item.meeting.location || t('common.notProvided') }}
                  </li>
                </ul>
              </section>
              <ul
                v-if="view === 'list'"
                class="courses"
              >
                <li
                  v-for="row in rows"
                  :key="row.enrollment.id"
                  class="card course"
                >
                  <div class="course-head">
                    <RouterLink
                      class="card-title"
                      :to="`/courses/${encodeURIComponent(row.enrollment.course_id)}`"
                    >
                      {{ row.course_name }}
                    </RouterLink>
                    <p class="small muted">
                      <template v-if="row.enrollment.teacher_ids.length">
                        <template
                          v-for="(id, index) in row.enrollment.teacher_ids"
                          :key="id"
                        >
                          <template v-if="index">
                            ·
                          </template>
                          <RouterLink :to="`/teachers/${encodeURIComponent(id)}`">
                            {{ teacher(id) ?? t('common.unknown') }}
                          </RouterLink>
                        </template>
                      </template>
                      <template v-else>
                        {{ t('courses.noTeacher') }}
                      </template>
                    </p>
                  </div>
                  <ul
                    v-if="row.meetings.length"
                    class="meetings"
                  >
                    <li
                      v-for="meeting in row.meetings"
                      :key="meeting.id"
                    >
                      <span><Clock aria-hidden="true" />{{ meeting.time_text || t('common.notProvided') }}</span>
                      <span><MapPin aria-hidden="true" />{{ meeting.location || t('common.notProvided') }}</span>
                    </li>
                  </ul>
                  <p
                    v-else
                    class="small muted"
                  >
                    {{ t('courses.noTime') }}
                  </p>
                  <div class="row course-links">
                    <RouterLink
                      class="btn btn-sm btn-ghost"
                      :to="withFilters('/resources', { course_id: row.enrollment.course_id })"
                    >
                      {{ t('academic.subject.resources') }}
                    </RouterLink>
                  </div>
                </li>
              </ul>
              <p
                v-if="fetched"
                class="subtle"
              >
                {{ t('courses.updated', { time: format.dateTime(fetched) }) }}
              </p>
            </div>
          </AsyncState>
        </div>
      </div>
    </AsyncState>
  </MeLayout>
</template>

<style scoped>
.wrap { flex-wrap: wrap; gap: .5rem; }
.picker { flex-wrap: nowrap; gap: .375rem; min-width: 0; }
.picker-week { display: grid; justify-items: center; min-width: 6.5rem; line-height: 1.25; }
.picker-week b { font-weight: 600; font-variant-numeric: tabular-nums; }
.picker-week small { font-size: .75rem; white-space: nowrap; }
.gridless { flex: 1 1 16rem; }
.courses { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); }
.course { display: flex; flex-direction: column; gap: .625rem; }
.course-head { display: grid; gap: .125rem; }
.meetings { display: grid; gap: .375rem; font-size: .875rem; }
.meetings li { display: flex; flex-wrap: wrap; gap: .25rem 1rem; }
.meetings span { display: inline-flex; align-items: center; gap: .3125rem; min-width: 0; overflow-wrap: anywhere; }
.meetings svg { flex: none; width: .9375rem; height: .9375rem; color: var(--label-3); }
.course-links { margin-block-start: auto; }
</style>
