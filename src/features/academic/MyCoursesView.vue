<script setup lang="ts">
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { useErrorText } from '../../shared/ui/messages'
import { toast } from '../../shared/ui/toast'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic, type OwnSchedule } from './api'
import { arrange, currentWeek, timetableOf } from './schedule'
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

const enrollments = useAsync(async (signal) => {
  const rows = (await api.myEnrollments(signal)).filter((row) => row.active)
  const names = await api.lookup(rows.flatMap((row) => [row.term_id, ...row.teacher_ids]), signal)
  return { rows, names }
})
const terms = computed(() => {
  const seen = [...new Set((enrollments.data.value?.rows ?? []).map((row) => row.term_id))]
  return seen.map((value) => ({ value, label: enrollments.data.value?.names.get(value)?.name ?? t('academic.offerings.unknownTerm') }))
})
const schedule = useAsync<OwnSchedule[]>((signal) => api.mySchedule(term.value, signal))
const rows = computed(() => schedule.data.value ?? [])
const arranged = computed(() => arrange(rows.value))
const timetable = computed(() => timetableOf(rows.value))
const lastWeek = computed(() => Math.max(1, ...arranged.value.lessons.flatMap((lesson) => lesson.weeks)))
const fetched = computed(() => rows.value.map((row) => row.enrollment.fetched_at).filter((value): value is string => !!value).sort().at(-1))

watch(terms, (list) => {
  if (!list.some((item) => item.value === term.value)) term.value = list.at(-1)?.value ?? ''
})
watch(term, (value) => {
  if (value) void schedule.reload()
})
watch(schedule.data, () => {
  week.value = currentWeek(timetable.value, lastWeek.value)
})
onMounted(enrollments.reload)

const teacher = (id: string) => enrollments.data.value?.names.get(id)?.name
const exporting = ref(false)
const exportError = ref('')
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
                  v-if="mode === 'week'"
                  class="row"
                  role="group"
                  :aria-label="t('courses.weekPicker')"
                >
                  <button
                    class="btn btn-sm icon-only"
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
                  <span aria-live="polite">{{ t('courses.weekNumber', { week: format.number(week) }) }}</span>
                  <button
                    class="btn btn-sm icon-only"
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
                </div>
                <span v-else />
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="exporting"
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
                v-if="mode === 'week'"
                :lessons="arranged.lessons"
                :timetable="timetable"
                :week="week"
              />
              <section
                v-if="mode === 'week' && arranged.unplaced.length"
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
                v-if="mode === 'list'"
                class="list"
              >
                <li
                  v-for="row in rows"
                  :key="row.enrollment.id"
                  class="card stack-sm"
                >
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
                  <p
                    v-if="row.meetings.length"
                    class="small"
                  >
                    <template
                      v-for="meeting in row.meetings"
                      :key="meeting.id"
                    >
                      {{ meeting.time_text || t('common.notProvided') }} · {{ meeting.location || t('common.notProvided') }}<br>
                    </template>
                  </p>
                  <p
                    v-else
                    class="small muted"
                  >
                    {{ t('courses.noTime') }}
                  </p>
                  <div class="row">
                    <RouterLink
                      v-if="row.enrollment.class_id"
                      class="btn btn-sm"
                      :to="`/classes/${encodeURIComponent(row.enrollment.class_id)}`"
                    >
                      {{ t('courses.classLink') }}
                    </RouterLink>
                    <RouterLink
                      class="btn btn-sm"
                      :to="{ path: '/resources', query: { course_id: row.enrollment.course_id } }"
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
</style>
