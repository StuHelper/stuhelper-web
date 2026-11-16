<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import type { Timetable } from './api'
import type { Lesson } from './schedule'

// One teaching week as a grid: periods down, weekdays across. Weekend columns
// appear only when a lesson uses them. Period times come from the school timetable.
// `dates` are the calendar dates of the shown week (Monday first) and `today` is the
// weekday to mark when the shown week is the current one; both are optional.
const props = withDefaults(defineProps<{ lessons: Lesson[]; timetable?: Timetable; week: number; dates?: string[]; today?: number }>(), { timetable: undefined, dates: () => [], today: undefined })
const { t } = useI18n()
const format = useFormat()

const shown = computed(() => props.lessons.filter((lesson) => lesson.weeks.includes(props.week)))
const days = computed(() => (props.lessons.some((lesson) => lesson.weekday > 5) ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]))
const periods = computed(() => {
  const last = Math.max(props.timetable?.periods.at(-1)?.number ?? 0, ...props.lessons.map((lesson) => lesson.end), 1)
  return Array.from({ length: last }, (_, index) => {
    const number = index + 1
    const time = props.timetable?.periods.find((period) => period.number === number)
    return { number, start: time?.start ?? '', range: time ? `${time.start}–${time.end}` : '' }
  })
})
// 2024-01-01 is a Monday; noon UTC keeps the weekday stable in every time zone.
const dayName = (day: number) => format.value.date(Date.UTC(2024, 0, day, 12), { weekday: 'short' })
// 04:00 UTC is noon at the school, so the calendar date is the one the timetable means.
const dayDate = (day: number) => (props.dates[day - 1] ? format.value.date(`${props.dates[day - 1]}T04:00:00Z`, { month: 'numeric', day: 'numeric' }) : '')
const place = (lesson: Lesson) => ({ gridColumn: String(days.value.indexOf(lesson.weekday) + 2), gridRow: `${lesson.start + 1} / ${lesson.end + 2}` })
// Each course keeps one colour in every week, so a glance separates the courses.
const palette = ['var(--c-blue)', 'var(--c-orange)', 'var(--c-purple)', 'var(--c-green)', 'var(--c-pink)', 'var(--c-cyan)', 'var(--c-indigo)', 'var(--c-flame)']
const tints = computed(() => new Map([...new Set(props.lessons.map((lesson) => lesson.courseId))].sort().map((id, index) => [id, palette[index % palette.length]!])))
const timeOf = (lesson: Lesson) => {
  const from = periods.value[lesson.start - 1]?.start
  const until = props.timetable?.periods.find((period) => period.number === lesson.end)?.end
  return from && until ? `${from}–${until}` : ''
}
</script>

<template>
  <div class="week-card card">
    <div
      class="week"
      :class="{ wide: days.length > 5 }"
      :style="{ gridTemplateColumns: `var(--period-column) repeat(${days.length}, minmax(var(--day-column), 1fr))`, gridTemplateRows: `auto repeat(${periods.length}, minmax(var(--period-row), auto))` }"
    >
      <span
        v-if="today && days.includes(today)"
        class="today-column"
        aria-hidden="true"
        :style="{ gridColumn: String(days.indexOf(today) + 2), gridRow: '1 / -1' }"
      />
      <span class="corner" />
      <span
        v-for="(day, index) in days"
        :key="day"
        class="day"
        :class="{ current: day === today }"
        :aria-current="day === today ? 'date' : undefined"
        :style="{ gridColumn: String(index + 2), gridRow: '1' }"
      ><b>{{ dayName(day) }}</b><small v-if="dayDate(day)">{{ dayDate(day) }}</small></span>
      <span
        v-for="period in periods"
        :key="period.number"
        class="period"
        :title="period.range || undefined"
        :style="{ gridColumn: '1 / -1', gridRow: String(period.number + 1) }"
      >
        <span class="period-label"><b>{{ format.number(period.number) }}</b><small v-if="period.start">{{ period.start }}</small></span>
      </span>
      <RouterLink
        v-for="lesson in shown"
        :key="lesson.key"
        class="lesson"
        :style="{ ...place(lesson), '--c': tints.get(lesson.courseId) }"
        :to="`/courses/${encodeURIComponent(lesson.courseId)}`"
        :aria-label="t('courses.lessonLabel', { course: lesson.course, day: dayName(lesson.weekday), start: format.number(lesson.start), end: format.number(lesson.end), location: lesson.location || t('common.notProvided') })"
      >
        <b>{{ lesson.course }}</b>
        <span class="where">{{ lesson.location || t('common.notProvided') }}</span>
        <span
          v-if="timeOf(lesson)"
          class="when"
        >{{ timeOf(lesson) }}</span>
      </RouterLink>
    </div>
    <p
      v-if="!shown.length"
      class="subtle empty"
    >
      {{ t('courses.noLessonsThisWeek') }}
    </p>
  </div>
</template>

<style scoped>
/* 不使用 sheet 这个类名：全局样式把它定义为固定定位的弹层。 */
.week-card { --period-column: 3.25rem; --day-column: 5.5rem; --period-row: 3.25rem; overflow-x: auto; padding: .5rem .625rem .75rem; }
.week { position: relative; display: grid; column-gap: 4px; }
.today-column { border-radius: var(--radius-sm); background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
.day { display: grid; justify-items: center; gap: 0; padding: .375rem .25rem .5rem; color: var(--label-2); font-size: .8125rem; line-height: 1.25; }
.day b { font-weight: 550; }
.day small { color: var(--label-3); font-size: .6875rem; font-variant-numeric: tabular-nums; }
.day.current, .day.current small { color: var(--accent); }
.day.current b { font-weight: 650; }
/* Each period is one full-width row with a hairline above, so lessons can be read against the time. */
.period { display: flex; align-items: flex-start; border-block-start: .5px solid var(--separator); pointer-events: none; }
.period-label { display: grid; justify-items: center; width: var(--period-column); padding-block-start: .375rem; color: var(--label-2); font-size: .8125rem; line-height: 1.2; }
.period-label b { font-weight: 550; }
.period-label small { color: var(--label-3); font-size: .6875rem; font-variant-numeric: tabular-nums; }
.lesson { position: relative; display: flex; flex-direction: column; gap: .125rem; min-width: 0; margin-block: 3px 2px; padding: .375rem .5rem .375rem .625rem; overflow: hidden; border-radius: 10px; background: color-mix(in srgb, var(--c) 14%, var(--surface)); box-shadow: inset 3px 0 0 var(--c); color: var(--label); font-size: .8125rem; line-height: 1.3; text-decoration: none; transition: transform .3s var(--spring), box-shadow .3s; }
[dir="rtl"] .lesson { box-shadow: inset -3px 0 0 var(--c); }
.lesson b { display: -webkit-box; overflow: hidden; font-weight: 600; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; }
.lesson .where { color: var(--label-2); font-size: .75rem; overflow-wrap: anywhere; }
.lesson .when { margin-block-start: auto; color: var(--label-3); font-size: .6875rem; font-variant-numeric: tabular-nums; }
@media (hover: hover) {
  .lesson:hover { box-shadow: inset 3px 0 0 var(--c), var(--shadow-lift); text-decoration: none; transform: translateY(-1px); }
  [dir="rtl"] .lesson:hover { box-shadow: inset -3px 0 0 var(--c), var(--shadow-lift); }
}
.lesson:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent-fill) 55%, transparent); outline-offset: 1px; }
.empty { margin: .75rem 0 .25rem; text-align: center; }
/* A phone shows the five weekdays without sideways scrolling; only a week with weekend lessons scrolls. */
@media (max-width: 640px) {
  .week-card { --period-column: 2.25rem; --day-column: 0px; --period-row: 3.5rem; padding-inline: .375rem; }
  .week { column-gap: 2px; }
  .week.wide { --day-column: 3.5rem; }
  .lesson { padding: .25rem .25rem .25rem .4375rem; border-radius: 8px; font-size: .6875rem; line-height: 1.25; }
  .lesson b { -webkit-line-clamp: 4; line-clamp: 4; }
  .lesson .where { font-size: .625rem; }
  .lesson .when { display: none; }
  .period-label small { font-size: .5625rem; }
}
</style>
