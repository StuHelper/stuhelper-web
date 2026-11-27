<script setup lang="ts">
import { BadgeCheck, ChevronDown, PenLine, Search } from 'lucide-vue-next'
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { myCoursesEnabled } from '../../app/features'
import { useVerification } from '../verification/api'
import { useAsync } from '../../shared/composables/async'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { useAcademic, type CatalogObject } from './api'

/**
 * The standing "write a course review" entry of the campus pages. It opens a picker:
 * a search over all courses, and, while the search is empty, the person's own courses
 * by term with the ones already reviewed marked. Picking an own course opens the editor
 * with its term chosen; picking a reviewed one opens that review instead.
 */
const props = defineProps<{ variant: 'bar' | 'fab' }>()
const { t } = useI18n()
const api = useAcademic()
const router = useRouter()
const open = ref(false)
const query = ref('')
const searchId = useId()

interface OwnRow { courseId: string; termId: string; teacherIds: string[]; name: string; code: string; teachers: string; reviewId?: string }
interface TermGroup { termId: string; name: string; order: number; rows: OwnRow[] }

// Own courses are listed only for a person with school data authorization, which is the
// consent to read their own enrollment. It covers the terms authorized so far, so a
// stopped authorization still lists them. Without it the panel offers recently visited
// courses and the way to turn it on.
const verification = useVerification()
const own = useAsync(async (signal) => {
  const authorization = await verification.schoolData(signal)
  if (authorization.state === 'inactive') return { state: 'off' as const, groups: [] as TermGroup[] }
  const enrollments = await api.myEnrollments(signal)
  // Every own course review, so a course is marked reviewed however many reviews precede it.
  const reviewed = new Map<string, string>()
  let after = ''
  for (let page = 0; page < 20; page++) {
    const entries = await api.myEntries({ kind: 'course', limit: 100, after: after || undefined }, signal)
    for (const row of entries.items) reviewed.set(`${row.target_id}:${row.term_id}`, row.id)
    if (!entries.next || entries.next === after) break
    after = entries.next
  }
  const names = await api.lookup(enrollments.flatMap((row) => [row.course_id, row.term_id, ...row.teacher_ids]), signal)
  const groups = new Map<string, TermGroup>()
  for (const row of enrollments) {
    if (!row.active) continue
    const group = groups.get(row.term_id) ?? { termId: row.term_id, name: names.get(row.term_id)?.name ?? row.term_id, order: row.term_order_key ?? 0, rows: [] }
    const course = names.get(row.course_id)
    group.rows.push({
      courseId: row.course_id,
      termId: row.term_id,
      teacherIds: row.teacher_ids.slice(),
      name: course?.name ?? row.course_id,
      code: typeof course?.code === 'string' ? course.code : '',
      teachers: row.teacher_ids.map((id) => names.get(id)?.name).filter(Boolean).join('、'),
      reviewId: reviewed.get(`${row.course_id}:${row.term_id}`),
    })
    groups.set(row.term_id, group)
  }
  // Newest term first; within a term the courses still to review come first.
  const list = [...groups.values()].sort((a, b) => b.order - a.order)
  for (const group of list) group.rows.sort((a, b) => Number(!!a.reviewId) - Number(!!b.reviewId) || a.name.localeCompare(b.name))
  return { state: 'ready' as const, groups: list }
})
const recent = useAsync(async (signal) => (await api.recentCourses(signal)).items.slice(0, 6).map((row) => row.course))
const ownGroups = computed(() => own.data.value?.groups ?? [])
const ownUnavailable = computed(() => own.status.value === 'error' || own.data.value?.state === 'off' || (own.data.value?.state === 'ready' && !ownGroups.value.length))
const pendingCount = computed(() => ownGroups.value.reduce((sum, group) => sum + group.rows.filter((row) => !row.reviewId).length, 0))
// The two latest terms start open; older terms fold away.
const expanded = ref(new Set<string>())
watch(ownGroups, (groups) => { expanded.value = new Set(groups.slice(0, 2).map((group) => group.termId)) })
function toggle(termId: string) {
  const next = new Set(expanded.value)
  if (next.has(termId)) next.delete(termId)
  else next.add(termId)
  expanded.value = next
}

// Search over all courses, a short moment after typing stops.
const results = shallowRef<CatalogObject[]>([])
const searching = ref(false)
const searchFailed = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let controller: AbortController | undefined
watch(query, (text) => {
  clearTimeout(timer)
  controller?.abort()
  const needle = text.trim()
  if (!needle) { results.value = []; searching.value = false; return }
  searching.value = true
  timer = setTimeout(async () => {
    controller = new AbortController()
    try {
      results.value = (await api.objects({ kind: 'course', q: needle, limit: 8 }, controller.signal)).items
      searchFailed.value = false
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      searchFailed.value = true
    }
    searching.value = false
  }, 250)
})

const input = ref<HTMLInputElement>()
function show() {
  open.value = true
  query.value = ''
  void own.reload()
  void recent.reload()
  // The dialog first focuses its close button; typing should go straight to the search.
  setTimeout(() => input.value?.focus(), 60)
}
function close() { open.value = false }
// An own course opens the editor with its term and every teacher of that enrollment chosen.
function write(courseId: string, termId?: string, teacherIds: string[] = []) {
  close()
  const query: Record<string, string> = { write: '1' }
  if (termId) query.term = termId
  if (teacherIds.length) query.teachers = teacherIds.join(',')
  void router.push({ path: `/courses/${encodeURIComponent(courseId)}`, query })
}
function pick(row: OwnRow) {
  if (row.reviewId) {
    close()
    void router.push(`/reviews/${encodeURIComponent(row.reviewId)}`)
  } else write(row.courseId, row.termId, row.teacherIds)
}
const codeOf = (course: CatalogObject) => (typeof course.code === 'string' ? course.code : '')
</script>

<template>
  <button
    v-if="props.variant === 'bar'"
    class="btn btn-primary btn-sm launcher-bar"
    type="button"
    @click="show"
  >
    <PenLine aria-hidden="true" />{{ t('academic.subject.writeCourse') }}
  </button>
  <button
    v-else
    class="launcher-fab"
    type="button"
    :aria-label="t('academic.subject.writeCourse')"
    @click="show"
  >
    <PenLine aria-hidden="true" />
  </button>

  <SheetDialog
    :open="open"
    :title="t('academic.launcher.title')"
    wide
    @close="close"
  >
    <div class="launcher">
      <label
        class="launcher-search"
        :for="searchId"
      >
        <Search aria-hidden="true" />
        <input
          :id="searchId"
          ref="input"
          v-model="query"
          class="launcher-input"
          type="search"
          autocomplete="off"
          :placeholder="t('academic.launcher.search')"
          :aria-label="t('academic.launcher.search')"
        >
      </label>

      <!-- Searching replaces the own list until the field is cleared. -->
      <section
        v-if="query.trim()"
        class="launcher-section"
        :aria-label="t('academic.launcher.results')"
        :aria-busy="searching || undefined"
      >
        <p
          v-if="searchFailed"
          class="notice notice-error small"
          role="alert"
        >
          {{ t('academic.launcher.searchFailed') }}
        </p>
        <p
          v-else-if="!searching && !results.length"
          class="empty small"
        >
          {{ t('academic.launcher.noResults') }}
        </p>
        <ul class="launcher-list">
          <li
            v-for="course in results"
            :key="course.id"
          >
            <button
              class="launcher-row"
              type="button"
              @click="write(course.id)"
            >
              <span class="launcher-main">
                <strong>{{ course.name }}</strong>
                <span class="subtle">{{ codeOf(course) }}</span>
              </span>
              <span class="launcher-go">{{ t('academic.launcher.write') }}</span>
            </button>
          </li>
        </ul>
      </section>

      <template v-else>
        <section
          v-if="!ownUnavailable"
          class="launcher-section"
          aria-labelledby="launcher-own"
          :aria-busy="own.status.value === 'loading' || undefined"
        >
          <div class="row-between">
            <h3
              id="launcher-own"
              class="launcher-heading"
            >
              {{ t('academic.launcher.mine') }}
            </h3>
            <span
              v-if="pendingCount"
              class="subtle"
            >{{ t('academic.launcher.pendingCount', { count: pendingCount }) }}</span>
          </div>
          <div
            v-for="group in ownGroups"
            :key="group.termId"
            class="launcher-term"
          >
            <button
              class="launcher-term-head"
              type="button"
              :aria-expanded="expanded.has(group.termId)"
              @click="toggle(group.termId)"
            >
              <span>{{ group.name }}</span>
              <span class="subtle">{{ t('academic.launcher.termCount', { count: group.rows.length }) }}</span>
              <ChevronDown
                class="launcher-chevron"
                :class="{ flip: expanded.has(group.termId) }"
                aria-hidden="true"
              />
            </button>
            <ul
              v-if="expanded.has(group.termId)"
              class="launcher-list"
            >
              <li
                v-for="row in group.rows"
                :key="`${row.courseId}:${row.termId}`"
              >
                <button
                  class="launcher-row"
                  :class="{ done: row.reviewId }"
                  type="button"
                  @click="pick(row)"
                >
                  <span class="launcher-main">
                    <strong>{{ row.name }}</strong>
                    <span class="subtle">{{ [row.code, row.teachers].filter(Boolean).join(' · ') }}</span>
                  </span>
                  <span
                    v-if="row.reviewId"
                    class="launcher-done"
                  ><BadgeCheck aria-hidden="true" />{{ t('academic.launcher.reviewed') }}</span>
                  <span
                    v-else
                    class="launcher-go"
                  >{{ t('academic.launcher.write') }}</span>
                </button>
              </li>
            </ul>
          </div>
        </section>

        <template v-else>
          <p class="notice notice-info small launcher-setup">
            <span>{{ t('academic.launcher.needSchoolData') }}</span>
            <RouterLink
              to="/me/verification/school-data"
              @click="close"
            >
              {{ t('academic.launcher.enable') }}
            </RouterLink>
          </p>
          <section
            v-if="recent.data.value?.length"
            class="launcher-section"
            aria-labelledby="launcher-recent"
          >
            <h3
              id="launcher-recent"
              class="launcher-heading"
            >
              {{ t('academic.launcher.recent') }}
            </h3>
            <ul class="launcher-list">
              <li
                v-for="course in recent.data.value"
                :key="course.id"
              >
                <button
                  class="launcher-row"
                  type="button"
                  @click="write(course.id)"
                >
                  <span class="launcher-main">
                    <strong>{{ course.name }}</strong>
                    <span class="subtle">{{ codeOf(course) }}</span>
                  </span>
                  <span class="launcher-go">{{ t('academic.launcher.write') }}</span>
                </button>
              </li>
            </ul>
          </section>
        </template>

        <RouterLink
          v-if="myCoursesEnabled && !ownUnavailable"
          class="small launcher-all"
          to="/me/courses"
          @click="close"
        >
          {{ t('academic.launcher.allCourses') }}
        </RouterLink>
      </template>
    </div>
  </SheetDialog>
</template>

<style scoped>
.launcher-bar { flex: none; }
.launcher-bar svg { width: 15px; height: 15px; }
.launcher-fab { position: fixed; inset-inline-end: 1rem; inset-block-end: calc(var(--tab-height, 64px) + var(--safe-bottom, 0px) + 1rem); z-index: 40; display: grid; place-items: center; width: 52px; height: 52px; border: 0; border-radius: 50%; background: var(--accent-fill); color: var(--on-accent); box-shadow: 0 8px 24px -6px rgb(0 0 0 / 35%); cursor: pointer; transition: transform .3s var(--spring); }
.launcher-fab:active { transform: scale(.92); }
.launcher-fab svg { width: 22px; height: 22px; }
.launcher { display: grid; gap: 1rem; min-height: min(60vh, 28rem); align-content: start; }
.launcher-search { display: flex; align-items: center; gap: .5rem; padding-inline: .875rem; height: 44px; border-radius: var(--radius); background: var(--fill); }
.launcher-search svg { flex: none; width: 18px; height: 18px; color: var(--label-3); }
.launcher-input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--label); font: inherit; outline: none; }
.launcher-section { display: grid; gap: .5rem; }
.launcher-heading { margin: 0; font-size: .875rem; font-weight: 600; color: var(--label-2); }
.launcher-term { display: grid; gap: .25rem; }
.launcher-term-head { display: flex; align-items: center; gap: .5rem; width: 100%; padding: .375rem .25rem; border: 0; background: transparent; color: var(--label); font: inherit; font-weight: 600; cursor: pointer; text-align: start; }
.launcher-term-head .subtle { font-weight: 400; }
.launcher-chevron { width: 16px; height: 16px; margin-inline-start: auto; color: var(--label-3); transition: transform .2s; }
.launcher-chevron.flip { transform: rotate(180deg); }
.launcher-list { display: grid; margin: 0; padding: 0; list-style: none; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-card); overflow: hidden; }
.launcher-list li + li { border-block-start: .5px solid var(--separator); }
.launcher-row { display: flex; align-items: center; gap: .75rem; width: 100%; min-height: 52px; padding: .5rem .875rem; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; transition: background-color .15s; }
.launcher-row:hover, .launcher-row:focus-visible { background: var(--accent-soft); }
.launcher-main { display: grid; flex: 1; gap: .125rem; min-width: 0; }
.launcher-main strong { font-weight: 550; overflow-wrap: anywhere; }
.launcher-go { flex: none; color: var(--accent); font-size: .8125rem; font-weight: 600; }
.launcher-done { display: inline-flex; flex: none; align-items: center; gap: .25rem; color: var(--success); font-size: .8125rem; }
.launcher-done svg { width: 15px; height: 15px; }
.launcher-row.done strong { color: var(--label-2); }
.launcher-setup { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
.launcher-all { justify-self: center; }
</style>
