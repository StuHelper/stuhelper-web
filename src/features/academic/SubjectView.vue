<script setup lang="ts">
import { hue } from '../../shared/hue'
import { teacherDirectoryEnabled } from '../../app/features'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import CompareButton from '../search/CompareButton.vue'
import { PenLine } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { withFilters } from '../../shared/pageFilters'
import { ApiError } from '../../shared/api/errors'
import { useAsync, usePaged } from '../../shared/composables/async'
import { rememberPage } from '../../shared/recent'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { knownCredits, listSize, useAcademic, type Result } from './api'
import ReviewEditor from './ReviewEditor.vue'
import ReviewFeed from './ReviewFeed.vue'
import StatisticsPanel from './StatisticsPanel.vue'
import TeacherHomepagePanel from './TeacherHomepagePanel.vue'
import { extras } from '../../shared/extras'
import { feature, useCapabilities } from '../../shared/capabilities'
import TabBar from '../../shared/ui/TabBar.vue'

// Course home or teacher home: facts, rating summary, reviews and the related teachers or courses.
const props = defineProps<{ kind: 'course' | 'teacher'; id: string }>()
const { t } = useI18n()
const capabilities = useCapabilities()
const format = useFormat()
const api = useAcademic()
const route = useRoute()
const router = useRouter()
const composing = ref(false)
const published = ref('')
// Teaching classes, their times and places are not shown to users; a course lists its
// teachers and a teacher lists the courses taught.
const tab = ref<'reviews' | 'mentor' | 'related'>('reviews')
const tabs = computed(() => [
  { value: 'reviews' as const, label: t(props.kind === 'course' ? 'academic.subject.courseReviews' : 'academic.subject.teacherCourseReviews') },
  ...(props.kind === 'teacher' ? [{ value: 'mentor' as const, label: t('academic.subject.mentorReviews') }] : []),
  { value: 'related' as const, label: t(props.kind === 'course' ? 'academic.subject.teachers' : 'academic.subject.courses') },
])
const statistics = ref<InstanceType<typeof StatisticsPanel>>()
const courseFeed = ref<InstanceType<typeof ReviewFeed>>()
const mentorFeed = ref<InstanceType<typeof ReviewFeed>>()

// A course that changed its code keeps its old id as a reference. Opening an old id resolves it
// and replaces the address with the current course, keeping the query; only the old id is replaced.
async function current(id: string, signal: AbortSignal) {
  if (props.kind !== 'course') return undefined
  try {
    const resolved = await api.resolution(id, signal)
    const target = resolved.object.canonical_id || resolved.object.id
    return target !== id && resolved.object.kind === 'course' ? target : undefined
  } catch {
    return undefined
  }
}
const entry = useAsync(async (signal) => {
  try {
    const data = await api.summary(props.id, signal)
    // An id of another kind must not render as this page.
    if (data.object.kind !== props.kind) throw new ApiError('not_found')
    const target = data.object.canonical_id && data.object.canonical_id !== props.id ? data.object.canonical_id : undefined
    if (target) void router.replace({ path: `/courses/${encodeURIComponent(target)}`, query: route.query, hash: route.hash })
    return data
  } catch (failure) {
    const target = failure instanceof ApiError && failure.code === 'not_found' ? await current(props.id, signal) : undefined
    if (target) {
      void router.replace({ path: `/courses/${encodeURIComponent(target)}`, query: route.query, hash: route.hash })
      return await api.summary(target, signal)
    }
    throw failure
  }
})
const subject = computed(() => entry.data.value?.object)
const credits = computed(() => (subject.value ? knownCredits(subject.value) : undefined))
const related = usePaged(async (after, signal) => {
  const page = await api.objects(props.kind === 'course' ? { kind: 'teacher', course_id: props.id, after, limit: listSize } : { kind: 'course', teacher_id: props.id, after, limit: listSize }, signal)
  return { items: page.items, next: page.next }
})


// The review launcher opens a course with `write=1` and, for an own course, its term and teachers.
// The editor opens once; the parameters are then dropped so a reload or a return does
// not open it again.
const launchTerm = ref<string>()
const launchTeachers = ref<string[]>()
watch(composing, (open) => { if (!open) { launchTerm.value = undefined; launchTeachers.value = undefined } })
watch(() => [props.kind, props.id, route.query.write] as const, ([kind, , write]) => {
  if (kind !== 'course' || write !== '1') return
  launchTerm.value = typeof route.query.term === 'string' ? route.query.term : undefined
  launchTeachers.value = typeof route.query.teachers === 'string' && route.query.teachers ? route.query.teachers.split(',') : undefined
  composing.value = true
  const rest = { ...route.query }
  delete rest.write
  delete rest.term
  delete rest.teachers
  void router.replace({ query: rest, hash: route.hash })
}, { immediate: true })

watch(() => [props.kind, props.id], () => {
  if (route.query.write !== '1') composing.value = false
  published.value = ''
  tab.value = 'reviews'
  void entry.reload()
  void related.reload()
}, { immediate: true })

watch(subject, (value) => {
  if (value) rememberPage({ path: `/${props.kind === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(value.id)}`, title: value.name, kind: props.kind })
})

function submitted(result: Result) {
  composing.value = false
  published.value = t(result.state === 'pending' ? 'academic.editor.pending' : 'academic.editor.published')
  statistics.value?.refresh()
  courseFeed.value?.refresh()
  mentorFeed.value?.refresh()
}

</script>

<template>
  <AsyncState
    skeleton="detail"
    :status="entry.status.value"
    :error="entry.error.value"
    @retry="entry.reload"
  >
    <div
      v-if="entry.data.value && subject"
      class="stack-lg appear"
    >
      <PageHeader
        class="subject-head"
        :back="kind === 'course' || !teacherDirectoryEnabled ? '/courses' : '/teachers'"
        :back-label="t(kind === 'course' || !teacherDirectoryEnabled ? 'nav.courses' : 'nav.teachers')"
        :title="subject.name"
      >
        <p
          v-if="subject.course_type === 'sports_project'"
          class="muted"
        >
          <span class="tag">{{ t('academic.subject.sportsProject') }}</span>
        </p>
        <p
          v-if="entry.data.value.department"
          class="muted"
        >
          {{ entry.data.value.department.name }}
        </p>
        <p
          v-if="subject.inactive"
          class="notice notice-warning small"
        >
          {{ t('academic.subject.inactiveNotice') }}
        </p>
        <template #actions>
          <component
            :is="action"
            v-for="(action, index) in extras.subjectActions"
            :id="id"
            :key="index"
            :kind="kind"
          />
          <FavoriteButton
            v-if="capabilities.has(feature.favorites)"
            :id="id"
            :kind="kind"
            text
          />
          <CompareButton
            :id="id"
            :kind="kind"
          />
          <RouterLink
            v-if="kind === 'course'"
            class="btn"
            :to="withFilters('/resources', { course_id: subject.id })"
          >
            {{ t('academic.subject.resources') }}
          </RouterLink>
          <!-- The main action closes the row on wide screens and leads it on phones, where the row scrolls. -->
          <button
            v-if="!composing && !subject.inactive"
            class="btn btn-primary write"
            type="button"
            @click="composing = true"
          >
            <PenLine aria-hidden="true" />{{ t(kind === 'course' ? 'academic.subject.writeCourse' : 'academic.subject.writeMentor') }}
          </button>
        </template>
      </PageHeader>

      <p
        v-if="published"
        class="notice notice-success"
        role="status"
      >
        {{ published }}
      </p>

      <ReviewEditor
        v-if="composing"
        :key="id"
        :kind="kind === 'course' ? 'course' : 'mentor'"
        :target-id="id"
        :school-id="subject.school_id"
        :initial-term-id="launchTerm"
        :initial-teacher-ids="launchTeachers"
        @submitted="submitted"
        @cancel="composing = false"
      />

      <div class="layout-aside">
        <div class="stack-lg">
          <StatisticsPanel
            ref="statistics"
            :kind="kind"
            :target-id="id"
            :school-id="subject.school_id"
          />
          <TeacherHomepagePanel
            v-if="kind === 'teacher'"
            :teacher-id="id"
          />
          <component
            :is="panel"
            v-for="(panel, index) in extras.subjectPanels"
            :id="id"
            :key="index"
            :kind="kind"
          />

          <section class="section">
            <TabBar
              v-model="tab"
              :tabs="tabs"
              :label="t('academic.subject.sections')"
              id-prefix="subject"
            />
            <div
              id="subject-panel"
              role="tabpanel"
              :aria-labelledby="`subject-tab-${tab}`"
            >
              <ReviewFeed
                v-if="tab === 'reviews'"
                ref="courseFeed"
                kind="course"
                :target-id="kind === 'course' ? id : undefined"
                :teacher-id="kind === 'teacher' ? id : undefined"
                :school-id="subject.school_id"
                filterable
              />
              <ReviewFeed
                v-else-if="tab === 'mentor'"
                ref="mentorFeed"
                kind="mentor"
                :target-id="id"
                :school-id="subject.school_id"
              />
              <PagedState
                v-else
                :status="related.status.value"
                :error="related.error.value"
                :count="related.items.value.length"
                :next="related.next.value"
                :appending="related.appending.value"
                :empty-text="t(kind === 'course' ? 'academic.subject.noTeachers' : 'academic.subject.noCourses')"
                @retry="related.reload"
                @more="related.loadMore"
              >
                <ul class="grid related">
                  <li
                    v-for="item in related.items.value"
                    :key="item.id"
                  >
                    <RouterLink
                      class="card card-link stack-sm"
                      :to="`/${kind === 'course' ? 'teachers' : 'courses'}/${encodeURIComponent(item.id)}`"
                    >
                      <span class="card-title">{{ item.name }}</span>
                      <span
                        v-if="kind === 'teacher'"
                        class="small muted"
                      >{{ knownCredits(item) === undefined ? t('academic.subject.creditsUnknown') : t('academic.subject.credits', { credits: format.number(knownCredits(item) ?? 0) }) }}</span>
                    </RouterLink>
                  </li>
                </ul>
              </PagedState>
            </div>
          </section>
        </div>

        <aside
          class="card stack facts-card"
          :class="{ 'facts-after': kind === 'course' }"
        >
          <h2>{{ t('academic.subject.facts') }}</h2>
          <dl class="facts">
            <div>
              <dt>{{ t(kind === 'course' ? 'academic.directory.college' : 'academic.directory.department') }}</dt>
              <dd>{{ entry.data.value.department?.name || t('common.notProvided') }}</dd>
            </div>
            <template v-if="kind === 'course'">
              <div>
                <dt>{{ t('academic.subject.code') }}</dt>
                <dd class="mono">
                  {{ subject.code || t('common.notProvided') }}
                </dd>
              </div>
              <div>
                <dt>{{ t('academic.subject.creditsLabel') }}</dt>
                <dd>{{ credits === undefined ? t('academic.subject.creditsUnknown') : format.number(credits) }}</dd>
              </div>
              <div>
                <dt>{{ t('academic.directory.category') }}</dt>
                <dd class="row">
                  <RouterLink
                    v-for="category in entry.data.value.categories"
                    :key="category.id"
                    class="tag tag-hue"
                    :style="{ '--hue': hue(category.id) }"
                    :to="withFilters('/courses', { category: category.id })"
                  >
                    {{ category.name }}
                  </RouterLink>
                  <span v-if="!entry.data.value.categories.length">{{ t('common.notProvided') }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ t('academic.directory.nature') }}</dt>
                <dd class="row">
                  <RouterLink
                    v-for="nature in entry.data.value.natures"
                    :key="nature.id"
                    class="tag tag-info"
                    :to="withFilters('/courses', { nature: nature.id })"
                  >
                    {{ nature.name }}
                  </RouterLink>
                  <span v-if="!entry.data.value.natures.length">{{ t('common.notProvided') }}</span>
                </dd>
              </div>
            </template>
            <!-- A course shows its English name, former codes and former names in their own rows;
                 the generic aliases stay for teachers. Each row hides when the value is missing. -->
            <template v-if="kind === 'course'">
              <div v-if="subject.english_name">
                <dt>{{ t('academic.subject.englishName') }}</dt>
                <dd>{{ subject.english_name }}</dd>
              </div>
              <div v-if="subject.former_codes?.length">
                <dt>{{ t('academic.subject.formerCodes') }}</dt>
                <dd class="mono">
                  {{ format.list(subject.former_codes) }}
                </dd>
              </div>
              <div v-if="subject.former_names?.length">
                <dt>{{ t('academic.subject.formerNames') }}</dt>
                <dd>{{ format.list(subject.former_names) }}</dd>
              </div>
              <div v-if="typeof subject.hours === 'number'">
                <dt>{{ t('academic.subject.hours') }}</dt>
                <dd>{{ format.number(subject.hours) }}</dd>
              </div>
            </template>
            <div v-else-if="subject.aliases.length">
              <dt>{{ t('academic.subject.aliases') }}</dt>
              <dd>{{ format.list(subject.aliases) }}</dd>
            </div>
          </dl>
          <div
            v-if="kind === 'teacher' || subject.biography"
            class="stack-sm"
          >
            <h3>{{ t('academic.subject.biography') }}</h3>
            <p class="prewrap small">
              {{ subject.biography || t('common.notProvided') }}
            </p>
          </div>
          <RouterLink
            v-if="kind === 'teacher'"
            class="btn btn-sm"
            :to="withFilters('/courses', { teacher: subject.id })"
          >
            {{ t('academic.subject.findCourses') }}
          </RouterLink>
        </aside>
      </div>
    </div>
  </AsyncState>
</template>

<style scoped>
/* 手机上操作排成一行可横滑。课程的基本信息放到评价后面，先看评分。 */
@media (max-width: 760px) {
  .subject-head, .subject-head :deep(.page-header-main) { min-width: 0; max-width: 100%; }
  .subject-head :deep(.page-actions) { flex-wrap: nowrap; width: 100%; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .subject-head :deep(.page-actions .btn) { flex: none; min-height: 38px; padding-block: .25rem; font-size: .875rem; }
  .subject-head :deep(.page-actions .write) { order: -1; }
}
.related { list-style: none; }
.facts-card h2 { font-size: 1.0625rem; }
.facts-card { position: sticky; inset-block-start: calc(var(--nav-height) + 1.5rem); }
.facts-card .facts { grid-template-columns: 1fr; }
@media (max-width: 960px) { .facts-card { position: static; order: -1; } .facts-card .facts { grid-template-columns: repeat(auto-fill, minmax(min(100%, 9rem), 1fr)); } }
@media (max-width: 960px) { .facts-card.facts-after { order: 1; } }
</style>
