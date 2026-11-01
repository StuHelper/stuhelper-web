<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { CalendarPlus, MapPin, Pencil } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MeLayout from '../../features/account/MeLayout.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { enrollments, courses, teachers, terms } from '../data'
import { periods, timetable, toast } from '../store'
const { t: tr } = useI18n()

const term = ref('t-26f')
const phone = window.matchMedia('(max-width: 760px)').matches
const mode = ref<'day' | 'week' | 'list'>(phone ? 'day' : 'week')
const days = [tr('demo.mon'), tr('demo.tue'), tr('demo.wed'), tr('demo.thu'), tr('demo.fri'), tr('demo.sat'), tr('demo.sun')]
const todayIndex = (new Date().getDay() || 7)
const day = ref(todayIndex)
const dayLessons = computed(() => timetable.filter((row) => row.day === day.value).sort((a, b) => a.start - b.start))
// 左右滑动切换日期。竖向滑动更明显时视为滚动页面。
let startX = 0
let startY = 0
function touchStart(event: TouchEvent) { startX = event.touches[0]?.clientX ?? 0; startY = event.touches[0]?.clientY ?? 0 }
function touchEnd(event: TouchEvent) {
  const dx = (event.changedTouches[0]?.clientX ?? 0) - startX
  const dy = (event.changedTouches[0]?.clientY ?? 0) - startY
  if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return
  day.value = (day.value + (dx < 0 ? 0 : 5)) % 7 + 1
}
const picked = ref<(typeof timetable)[number]>()
const place = ref('')
const isCurrent = computed(() => term.value === 't-26f')
const list = computed(() => enrollments.filter((e) => e.term_id === term.value))
const name = (id: string) => courses.find((c) => c.id === id)?.name
const teacher = (ids: string[]) => ids.map((id) => teachers.find((t) => t.id === id)?.name).join('、')
const credits = computed(() => list.value.reduce((sum, e) => sum + Number(courses.find((c) => c.id === e.course_id)?.credits ?? 0), 0))
const termTabs = terms.filter((t) => t.id !== 't-25f').reverse().map((t) => ({ value: t.id, label: t.name }))
function open(row: (typeof timetable)[number]) { picked.value = row; place.value = row.place }
function save() { toast(tr('demo.correctionSaved')); if (picked.value) picked.value.place = place.value; picked.value = undefined }
</script>

<template>
  <MeLayout :title="tr('demo.myCourses')" :description="tr('demo.scheduleDescription')">
    <div class="row-between">
      <TabBar v-model="term" :tabs="termTabs" :label="tr('demo.term')" id-prefix="term" />
      <TabBar v-if="isCurrent" v-model="mode" :tabs="[...(phone ? [{ value: 'day' as const, label: tr('demo.dayView') }] : []), { value: 'week' as const, label: tr('demo.weekView') }, { value: 'list' as const, label: tr('demo.list') }]" :label="tr('demo.viewMode')" id-prefix="mode" />
    </div>
    <div class="row-between summary"><p class="subtle">{{ tr('demo.coursesCredits', { p0: list.length, p1: credits }) }}</p><button class="btn btn-sm" type="button" @click="toast(tr('demo.calendarGenerated'))"><CalendarPlus aria-hidden="true" />{{ tr('demo.exportCalendar') }}</button></div>

    <section v-if="isCurrent && mode === 'day'" class="stack" :aria-label="tr('demo.dayTimetable')" @touchstart.passive="touchStart" @touchend.passive="touchEnd">
      <div class="d-chips days" role="group" :aria-label="tr('demo.pickDay')"><button v-for="(d, i) in days" :key="d" class="d-chip" type="button" :aria-pressed="day === i + 1" @click="day = i + 1">{{ d }}<span v-if="i + 1 === todayIndex" class="dot" aria-hidden="true" /></button></div>
      <ul v-if="dayLessons.length" :key="day" class="today d-list-in">
        <li v-for="row in dayLessons" :key="row.name + row.start"><button type="button" class="lesson-row" :style="{ '--c': row.color }" @click="open(row)"><span class="time">{{ tr('demo.periods', { p0: row.start, p1: row.end }) }}<small>{{ periods[row.start - 1] }}</small></span><span class="group-body"><b>{{ row.name }}</b><span class="subtle">{{ row.place }} · {{ row.teacher }}</span></span></button></li>
      </ul>
      <p v-else :key="`none${day}`" class="card empty d-list-in">{{ tr('demo.noClassesToday') }}</p>
    </section>

    <div v-else-if="isCurrent && mode === 'week'" class="sheet-wrap card">
      <div class="week" role="table" :aria-label="tr('demo.weekTimetable')">
        <div class="corner" />
        <div v-for="(d, i) in days" :key="d" class="day" :class="{ today: i + 1 === todayIndex }" :style="{ gridColumn: i + 2 }">{{ d }}</div>
        <div v-for="(p, i) in periods" :key="p" class="period" :style="{ gridRow: i + 2 }"><b>{{ i + 1 }}</b><span>{{ p }}</span></div>
        <div v-for="(p, i) in periods" :key="`l${p}`" class="line" :style="{ gridRow: i + 2 }" />
        <button v-for="row in timetable" :key="`${row.name}${row.day}`" type="button" class="lesson" :style="{ gridColumn: row.day + 1, gridRow: `${row.start + 1} / ${row.end + 2}`, '--c': row.color }" @click="open(row)">
          <b>{{ row.name }}</b><span>{{ row.place }}</span>
        </button>
      </div>
    </div>

    <ul v-else class="group">
      <li v-for="e in list" :key="e.id">
        <RouterLink class="group-row" :to="`/courses/${e.course_id}`">
          <span class="group-body"><span class="group-title">{{ name(e.course_id) }}</span><span class="group-detail">{{ teacher(e.teacher_ids) }}</span></span>
          <RouterLink v-if="!isCurrent" class="btn btn-sm btn-ghost" :to="`/courses/${e.course_id}`">{{ tr('demo.writeReview') }}</RouterLink>
        </RouterLink>
      </li>
    </ul>

    <SheetDialog :open="!!picked" :title="picked?.name ?? ''" :description="`${picked?.teacher} · ${picked?.weeks}`" @close="picked = undefined">
      <p class="row muted small"><MapPin class="pin" aria-hidden="true" />{{ tr('demo.dayPeriodPlace', { p0: days[(picked?.day ?? 1) - 1], p1: picked?.start, p2: picked?.end, p3: picked?.place }) }}</p>
      <label class="field"><span class="field-label row"><Pencil class="pin" aria-hidden="true" />{{ tr('demo.correctPlace') }}</span><input v-model="place" class="input"><span class="field-hint">{{ tr('demo.correctionHint') }}</span></label>
      <div class="form-actions">
        <button class="btn btn-primary" type="button" :disabled="place === picked?.place" @click="save">{{ tr('demo.saveCorrection') }}</button>
        <RouterLink class="btn" :to="`/courses/${picked?.course}`">{{ tr('demo.viewCourse') }}</RouterLink>
      </div>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.sheet-wrap { padding: .5rem; overflow-x: auto; }
.week { position: relative; display: grid; grid-template-columns: 3.25rem repeat(7, minmax(5.25rem, 1fr)); grid-template-rows: 2.25rem repeat(12, 3.25rem); min-width: 42rem; }
.day { grid-row: 1; align-self: center; color: var(--label-2); font-size: .8125rem; font-weight: 550; text-align: center; }
.day.today { color: var(--accent); }
.period { grid-column: 1; display: grid; align-content: center; justify-items: center; color: var(--label-3); font-size: .6875rem; font-variant-numeric: tabular-nums; }
.period b { color: var(--label-2); font-size: .8125rem; font-weight: 550; }
.line { grid-column: 2 / -1; border-block-start: .5px solid var(--separator); }
.lesson { z-index: 1; display: grid; align-content: start; gap: .125rem; margin: 2px; padding: .4375rem .5rem; overflow: hidden; border: 0; border-inline-start: 3px solid var(--c); border-radius: 8px; background: color-mix(in srgb, var(--c) 14%, var(--surface)); color: var(--label); font: inherit; text-align: start; cursor: pointer; transition: transform .3s var(--spring), box-shadow .2s; }
.lesson:hover { box-shadow: var(--shadow-card); transform: scale(1.02); }
.lesson b { font-size: .8125rem; font-weight: 600; line-height: 1.25; }
.lesson span { color: var(--label-2); font-size: .6875rem; }
.pin { width: .9375rem; height: .9375rem; }
.summary { flex-wrap: nowrap; }
.days .d-chip { position: relative; }
.dot { position: absolute; inset-block-end: 3px; inset-inline-start: 50%; width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
.today { display: grid; gap: .5rem; }
.lesson-row { display: flex; align-items: center; gap: .875rem; width: 100%; padding: .75rem .875rem; border: 0; border-inline-start: 4px solid var(--c); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--c) 10%, var(--surface)); color: inherit; font: inherit; text-align: start; cursor: pointer; }
.lesson-row b { font-weight: 600; }
.time { display: grid; flex: none; width: 5rem; color: var(--label-2); font-size: .8125rem; }
.time small { color: var(--label-3); font-size: .75rem; }
</style>
