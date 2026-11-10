<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import type { Timetable } from './api'
import type { Lesson } from './schedule'

// One teaching week as a grid: periods down, weekdays across. Weekend columns
// appear only when a lesson uses them. Period times come from the school timetable.
const props = defineProps<{ lessons: Lesson[]; timetable?: Timetable; week: number }>()
const { t } = useI18n()
const format = useFormat()

const shown = computed(() => props.lessons.filter((lesson) => lesson.weeks.includes(props.week)))
const days = computed(() => (props.lessons.some((lesson) => lesson.weekday > 5) ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]))
const periods = computed(() => {
  const last = Math.max(props.timetable?.periods.at(-1)?.number ?? 0, ...props.lessons.map((lesson) => lesson.end), 1)
  return Array.from({ length: last }, (_, index) => {
    const number = index + 1
    const time = props.timetable?.periods.find((period) => period.number === number)
    return { number, time: time ? `${time.start}–${time.end}` : '' }
  })
})
// 2024-01-01 is a Monday; noon UTC keeps the weekday stable in every time zone.
const dayName = (day: number) => format.value.date(Date.UTC(2024, 0, day, 12), { weekday: 'short' })
const place = (lesson: Lesson) => ({ gridColumn: String(days.value.indexOf(lesson.weekday) + 2), gridRow: `${lesson.start + 1} / ${lesson.end + 2}` })
</script>

<template>
  <div class="sheet card">
    <div
      class="week"
      :style="{ gridTemplateColumns: `minmax(3.5rem, auto) repeat(${days.length}, minmax(5.5rem, 1fr))`, gridTemplateRows: `auto repeat(${periods.length}, minmax(3rem, auto))` }"
    >
      <span class="corner" />
      <span
        v-for="(day, index) in days"
        :key="day"
        class="day"
        :style="{ gridColumn: String(index + 2), gridRow: '1' }"
      >{{ dayName(day) }}</span>
      <span
        v-for="period in periods"
        :key="period.number"
        class="period"
        :style="{ gridColumn: '1', gridRow: String(period.number + 1) }"
      >
        <b>{{ format.number(period.number) }}</b>
        <small v-if="period.time">{{ period.time }}</small>
      </span>
      <RouterLink
        v-for="lesson in shown"
        :key="lesson.key"
        class="lesson"
        :style="place(lesson)"
        :to="`/courses/${encodeURIComponent(lesson.courseId)}`"
        :aria-label="t('courses.lessonLabel', { course: lesson.course, day: dayName(lesson.weekday), start: format.number(lesson.start), end: format.number(lesson.end), location: lesson.location || t('common.notProvided') })"
      >
        <b>{{ lesson.course }}</b>
        <span class="subtle">{{ lesson.location || t('common.notProvided') }}</span>
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
.sheet { overflow-x: auto; padding: .5rem; }
.week { display: grid; gap: 2px; min-inline-size: 34rem; }
.day, .period { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: .25rem; font-size: .8rem; color: var(--label-2); }
.period small { font-size: .7rem; color: var(--label-3); }
.lesson { display: flex; flex-direction: column; gap: .15rem; padding: .4rem .5rem; border-radius: 8px; background: var(--accent-soft); color: inherit; text-decoration: none; font-size: .8rem; overflow: hidden; }
.lesson:focus-visible { outline: 2px solid var(--accent-fill); outline-offset: 1px; }
.empty { text-align: center; margin: .75rem 0 .25rem; }
</style>
