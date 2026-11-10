<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Scale } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { courseSeeds, departments, resources, reviews, teachers, teachesIn } from '../data'
import { compare, levelsOf, toggleCompare } from '../store'
import Dist from './Dist.vue'
import FavoriteButton from '../../features/favorites/FavoriteButton.vue'
import Drawer from './Drawer.vue'
import Radar from './Radar.vue'
import Trend from './Trend.vue'
const { t: tr } = useI18n()
// 不离开列表就能看课程或教师的要点。
const props = defineProps<{ kind: 'course' | 'teacher'; id?: string }>()
defineEmits<{ close: [] }>()
const dept = (id?: string) => departments.find((d) => d.id === id)?.name ?? ''
const course = computed(() => (props.kind === 'course' ? courseSeeds.find((r) => r[0] === props.id) : undefined))
const teacher = computed(() => (props.kind === 'teacher' ? teachers.find((t) => t.id === props.id) as { id: string; name: string; biography?: string; department_id?: string } | undefined : undefined))
const name = computed(() => course.value?.[1] ?? teacher.value?.name ?? '')
const note = computed(() => (course.value ? tr('demo.codeDeptCredits', { p0: course.value[2], p1: dept(course.value[3]), p2: course.value[6] }) : dept(teacher.value?.department_id)))
const levels = computed(() => (props.id ? levelsOf(props.kind, props.id) : [0, 0, 0, 0, 0]))
const top = computed(() => (props.id ? reviews.filter((r) => r.target_id === props.id || r.teacher_id === props.id).sort((a, b) => b.upvotes - a.upvotes)[0] : undefined))
const people = computed(() => teachesIn.filter(([c]) => c === props.id).map(([, p]) => teachers.find((t) => t.id === p)!))
const taught = computed(() => teachesIn.filter(([, p]) => p === props.id).map(([c]) => courseSeeds.find((r) => r[0] === c)!))
// 抽屉关闭时 id 为空，不能匹配到没有所属课程的资料。
const files = computed(() => (props.id ? resources.filter((r) => r.current?.metadata.associations.course_id === props.id).slice(0, 3) : []))
const on = computed(() => !!props.id && compare[props.kind].includes(props.id))
</script>
<template>
  <Drawer :open="!!id" :title="name" :note="note" @close="$emit('close')">
    <p v-if="teacher?.biography" class="muted small">{{ teacher.biography }}</p>
    <Radar :series="[{ name, values: levels }]" :size="240" />
    <section class="stack-sm"><h3 class="d-title">{{ tr('demo.recommendationDist') }}</h3><Dist :id="id ?? ''" :level="levels[0] ?? 0" /></section>
    <section class="stack-sm"><h3 class="d-title">{{ tr('demo.trendByTerm') }}</h3><Trend :id="id ?? ''" :level="levels[0] ?? 0" /></section>
    <section v-if="people.length" class="stack-sm"><h3 class="d-title">{{ tr('demo.instructors') }}</h3><ul class="links"><li v-for="p in people" :key="p.id"><RouterLink :to="`/teachers/${p.id}`">{{ p.name }}</RouterLink></li></ul></section>
    <section v-if="taught.length" class="stack-sm"><h3 class="d-title">{{ tr('demo.taughtCourses') }}</h3><ul class="links"><li v-for="c in taught" :key="c[0]"><RouterLink :to="`/courses/${c[0]}`">{{ c[1] }}</RouterLink></li></ul></section>
    <section v-if="top" class="stack-sm"><h3 class="d-title">{{ tr('demo.topReview') }}</h3><div class="quote"><b>{{ top.title }}</b><p class="muted small clamp-3">{{ top.body }}</p><span class="subtle">{{ tr('demo.upvotes', { p0: top.upvotes }) }}</span></div></section>
    <section v-if="files.length" class="stack-sm"><h3 class="d-title">{{ tr('demo.relatedResources') }}</h3><ul class="links column"><li v-for="r in files" :key="r.id"><RouterLink :to="`/resources/items/${r.id}`">{{ r.current!.metadata.title }}</RouterLink></li></ul></section>
    <template #footer>
      <FavoriteButton v-if="id" :id="id" :kind="kind" text />
      <button class="btn" type="button" :aria-pressed="on" @click="id && toggleCompare(kind, id)"><Scale aria-hidden="true" />{{ on ? tr('demo.inCompare') : tr('demo.addToCompare') }}</button>
      <RouterLink class="btn btn-primary" :to="`/${kind === 'course' ? 'courses' : 'teachers'}/${id}`">{{ tr('demo.viewDetails') }}</RouterLink>
    </template>
  </Drawer>
</template>
<style scoped>
.links { display: flex; flex-wrap: wrap; gap: .25rem 1rem; font-size: .9375rem; }
.links.column { display: grid; }
.quote { display: grid; gap: .25rem; padding: .75rem 1rem; border-radius: var(--radius-sm); background: var(--fill); }
.clamp-3 { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
</style>
