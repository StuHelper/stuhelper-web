<script setup lang="ts">
import { CalendarPlus, MapPin, Pencil } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MeLayout from '../../features/account/MeLayout.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { enrollments, courses, teachers, terms } from '../data'
import { periods, timetable, toast } from '../store'

const term = ref('t-26f')
const mode = ref<'week' | 'list'>('week')
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const todayIndex = (new Date().getDay() || 7)
const picked = ref<(typeof timetable)[number]>()
const place = ref('')
const isCurrent = computed(() => term.value === 't-26f')
const list = computed(() => enrollments.filter((e) => e.term_id === term.value))
const name = (id: string) => courses.find((c) => c.id === id)?.name
const teacher = (ids: string[]) => ids.map((id) => teachers.find((t) => t.id === id)?.name).join('、')
const credits = computed(() => list.value.reduce((sum, e) => sum + Number(courses.find((c) => c.id === e.course_id)?.credits ?? 0), 0))
const termTabs = terms.filter((t) => t.id !== 't-25f').reverse().map((t) => ({ value: t.id, label: t.name }))
function open(row: (typeof timetable)[number]) { picked.value = row; place.value = row.place }
function save() { toast('已保存个人更正，只有你能看到'); if (picked.value) picked.value.place = place.value; picked.value = undefined }
</script>

<template>
  <MeLayout title="我的课程" description="课表来自选课记录，个人更正只影响你自己看到的内容。">
    <template #actions>
      <button class="btn btn-sm" type="button" @click="toast('日历文件已生成')"><CalendarPlus aria-hidden="true" />导出日历</button>
    </template>
    <div class="row-between">
      <TabBar v-model="term" :tabs="termTabs" label="学期" id-prefix="term" />
      <TabBar v-if="isCurrent" v-model="mode" :tabs="[{ value: 'week', label: '周视图' }, { value: 'list', label: '列表' }]" label="视图" id-prefix="mode" />
    </div>
    <p class="subtle">{{ list.length }} 门课程 · {{ credits }} 学分</p>

    <div v-if="isCurrent && mode === 'week'" class="sheet-wrap card">
      <div class="week" role="table" aria-label="周课表">
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
          <RouterLink v-if="!isCurrent" class="btn btn-sm btn-ghost" :to="`/courses/${e.course_id}`">写评价</RouterLink>
        </RouterLink>
      </li>
    </ul>

    <SheetDialog :open="!!picked" :title="picked?.name ?? ''" :description="`${picked?.teacher} · ${picked?.weeks}`" @close="picked = undefined">
      <p class="row muted small"><MapPin class="pin" aria-hidden="true" />{{ days[(picked?.day ?? 1) - 1] }} 第 {{ picked?.start }}-{{ picked?.end }} 节 · {{ picked?.place }}</p>
      <label class="field"><span class="field-label row"><Pencil class="pin" aria-hidden="true" />更正上课地点</span><input v-model="place" class="input"><span class="field-hint">只有你能看到更正，原始选课记录不变。</span></label>
      <div class="form-actions">
        <button class="btn btn-primary" type="button" :disabled="place === picked?.place" @click="save">保存更正</button>
        <RouterLink class="btn" :to="`/courses/${picked?.course}`">查看课程</RouterLink>
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
</style>
