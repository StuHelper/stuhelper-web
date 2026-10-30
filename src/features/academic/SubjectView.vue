<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { ApiError } from '../../shared/api/errors'
import { useAsync, useMutation, usePaged } from '../../shared/composables/async'
import { useLeaveGuard } from '../../shared/composables/leave'
import AsyncState from '../../shared/ui/AsyncState.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { knownCredits, listSize, useAcademic, type Result } from './api'
import OfferingsList from './OfferingsList.vue'
import ReviewEditor from './ReviewEditor.vue'
import ReviewFeed from './ReviewFeed.vue'
import StatisticsPanel from './StatisticsPanel.vue'
import TabBar from '../../shared/ui/TabBar.vue'

// Course home or teacher home: facts, rating summary, reviews and offerings.
const props = defineProps<{ kind: 'course' | 'teacher'; id: string }>()
const { t } = useI18n()
const format = useFormat()
const api = useAcademic()
const bookmark = useMutation()
const composing = ref(false)
const published = ref('')
const bookmarked = ref('')
const tab = ref<'reviews' | 'mentor' | 'offerings' | 'related'>('reviews')
const tabs = computed(() => [
  { value: 'reviews' as const, label: t(props.kind === 'course' ? 'academic.subject.courseReviews' : 'academic.subject.teacherCourseReviews') },
  ...(props.kind === 'teacher' ? [{ value: 'mentor' as const, label: t('academic.subject.mentorReviews') }] : []),
  { value: 'offerings' as const, label: t('academic.offerings.title') },
  { value: 'related' as const, label: t(props.kind === 'course' ? 'academic.subject.teachers' : 'academic.subject.courses') },
])
const statistics = ref<InstanceType<typeof StatisticsPanel>>()
const courseFeed = ref<InstanceType<typeof ReviewFeed>>()
const mentorFeed = ref<InstanceType<typeof ReviewFeed>>()

const entry = useAsync(async (signal) => {
  const data = await api.summary(props.id, signal)
  // An id of another kind must not render as this page.
  if (data.object.kind !== props.kind) throw new ApiError('not_found')
  return data
})
const subject = computed(() => entry.data.value?.object)
const credits = computed(() => (subject.value ? knownCredits(subject.value) : undefined))
const related = usePaged(async (after, signal) => {
  const page = await api.objects(props.kind === 'course' ? { kind: 'teacher', course_id: props.id, after, limit: listSize } : { kind: 'course', teacher_id: props.id, after, limit: listSize }, signal)
  return { items: page.items, next: page.next }
})

// A bookmark whose result is unknown must be confirmed before the page changes subject.
useLeaveGuard(() => (bookmark.uncertain.value || bookmark.busy.value ? t('common.leaveUncertain') : ''))

watch(() => props.id, () => {
  composing.value = false
  published.value = ''
  bookmarked.value = ''
  tab.value = 'reviews'
  void entry.reload()
  void related.reload()
}, { immediate: true })

function submitted(result: Result) {
  composing.value = false
  published.value = t(result.state === 'pending' ? 'academic.editor.pending' : 'academic.editor.published')
  statistics.value?.refresh()
  courseFeed.value?.refresh()
  mentorFeed.value?.refresh()
}

async function addBookmark() {
  bookmarked.value = ''
  const result = await bookmark.run(`bookmark:${props.id}`, { target_id: props.id, set: true }, (body, key) => api.setBookmark(body, key))
  if (result) bookmarked.value = t('academic.subject.bookmarked')
}
async function retryBookmark() {
  if (await bookmark.retry()) bookmarked.value = t('academic.subject.bookmarked')
}
</script>

<template>
  <AsyncState
    :status="entry.status.value"
    :error="entry.error.value"
    @retry="entry.reload"
  >
    <div
      v-if="entry.data.value && subject"
      class="stack-lg"
    >
      <PageHeader
        :eyebrow="t(kind === 'course' ? 'academic.course' : 'academic.teacher')"
        :title="subject.name"
      >
        <p class="muted">
          {{ entry.data.value.school.name }}<template v-if="entry.data.value.department">
            · {{ entry.data.value.department.name }}
          </template>
        </p>
        <p
          v-if="subject.inactive"
          class="notice notice-warning small"
        >
          {{ t('academic.subject.inactiveNotice') }}
        </p>
        <template #actions>
          <button
            v-if="!composing && !subject.inactive"
            class="btn btn-primary"
            type="button"
            @click="composing = true"
          >
            {{ t(kind === 'course' ? 'academic.subject.writeCourse' : 'academic.subject.writeMentor') }}
          </button>
          <RouterLink
            v-if="kind === 'course'"
            class="btn"
            :to="{ path: '/resources', query: { school_id: subject.school_id, course_id: subject.id } }"
          >
            {{ t('academic.subject.resources') }}
          </RouterLink>
          <button
            v-if="kind === 'course'"
            class="btn"
            type="button"
            :disabled="bookmark.busy.value || bookmark.uncertain.value"
            @click="addBookmark"
          >
            {{ t('academic.subject.bookmark') }}
          </button>
        </template>
      </PageHeader>

      <MutationNotice
        :busy="bookmark.busy.value"
        :error="bookmark.error.value"
        :uncertain="bookmark.uncertain.value"
        :success="bookmarked || published"
        @retry="retryBookmark"
      />

      <ReviewEditor
        v-if="composing"
        :key="id"
        :kind="kind === 'course' ? 'course' : 'mentor'"
        :target-id="id"
        :school-id="subject.school_id"
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
              <OfferingsList
                v-else-if="tab === 'offerings'"
                :course-id="kind === 'course' ? id : undefined"
                :teacher-id="kind === 'teacher' ? id : undefined"
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

        <aside class="card stack facts-card">
          <h2>{{ t('academic.subject.facts') }}</h2>
          <dl class="facts">
            <div>
              <dt>{{ t('academic.directory.school') }}</dt>
              <dd>{{ entry.data.value.school.name }}</dd>
            </div>
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
                    class="tag tag-info"
                    :to="{ path: '/courses', query: { school: subject.school_id, category: category.id } }"
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
                    :to="{ path: '/courses', query: { school: subject.school_id, nature: nature.id } }"
                  >
                    {{ nature.name }}
                  </RouterLink>
                  <span v-if="!entry.data.value.natures.length">{{ t('common.notProvided') }}</span>
                </dd>
              </div>
            </template>
            <div v-if="subject.aliases.length">
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
            :to="{ path: '/courses', query: { school: subject.school_id, teacher: subject.id } }"
          >
            {{ t('academic.subject.findCourses') }}
          </RouterLink>
        </aside>
      </div>
    </div>
  </AsyncState>
</template>

<style scoped>
.related { list-style: none; }
.facts-card { position: sticky; top: 76px; }
.facts-card .facts { grid-template-columns: 1fr; }
@media (max-width: 900px) { .facts-card { position: static; order: -1; } }
</style>
