<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useErrorText } from '../../shared/ui/messages'
import { useFormat } from '../../app/i18n'
import { ApiError, errorCode } from '../../shared/api/errors'
import { useNow } from '../../shared/composables/clock'
import { useAsync, useMutation, usePaged } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { useAccess, useCampusId } from '../account/access'
import MeLayout from '../account/MeLayout.vue'
import { arrayCursor, listSize, useAcademic, type Draft, type OwnOverview, type OwnVote, type Reference, type Result, type Review, type Task } from './api'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'

// The author's own reviews, drafts, votes and requests. Names come from own-record references,
// so the page keeps working after content admission lapses.
type Tab = 'entries' | 'drafts' | 'votes' | 'requests'
type Row = { kind: 'vote'; vote: OwnVote } | { kind: 'review'; review: Review } | { kind: 'draft'; draft: Draft } | { kind: 'task'; task: Task }
type PendingItem = OwnOverview['pending_courses']['items'][number]

const { t, te } = useI18n()
const format = useFormat()
const route = useRoute()
const router = useRouter()
const api = useAcademic()
const campus = useCampusId()
const now = useNow()
const write = useMutation()
const tabNames: Tab[] = ['entries', 'drafts', 'votes', 'requests']
const tab = computed<Tab>({
  get: () => tabNames.find((value) => value === route.query.tab) ?? 'entries',
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
})
const tabs = computed(() => tabNames.map((value) => ({ value, label: t(`me.reviewTabs.${value}`) })))
const names = shallowRef(new Map<string, Reference>())
const access = useAccess()
const editingSchool = computed(() => access.state.value === 'verified' ? access.campus.value?.id ?? '' : '')
const editing = shallowRef<Draft>()
const composingPending = shallowRef<{ courseId: string; termId: string; schoolId: string }>()
const errorText = useErrorText()
const editError = ref('')
const removing = shallowRef<{ kind: 'draft'; draft: Draft }>()
const appealing = shallowRef<Task>()
const appealReason = ref('')
const success = ref('')
const overview = useAsync((signal) => api.overview(signal))
const pendingCourses = computed(() => (overview.data.value?.pending_courses.state === 'available' ? overview.data.value.pending_courses.items : []))

const rows = usePaged<Row>(async (after, signal) => {
  const query = { after, limit: listSize }
  let items: Row[]
  let next: string
  let ids: (string | undefined)[]
  if (tab.value === 'entries') {
    const page = await api.myEntries({ ...query, sort: 'newest' }, signal)
    items = page.items.map((review) => ({ kind: 'review', review }))
    next = page.next
    ids = page.items.flatMap((row) => [row.target_id, row.term_id, row.teacher_id])
  } else if (tab.value === 'votes') {
    const list = await api.myVotes(query, signal)
    items = list.map((vote) => ({ kind: 'vote', vote }))
    next = arrayCursor(list, (row) => row.id)
    ids = list.flatMap((row) => [row.target_id, row.term_id])
  } else if (tab.value === 'drafts') {
    const list = await api.myDrafts(query, signal)
    items = list.map((draft) => ({ kind: 'draft', draft }))
    next = arrayCursor(list, (row) => row.id)
    ids = list.flatMap((row) => row.reference_ids)
  } else {
    const list = await api.myTasks(query, signal)
    items = list.map((task) => ({ kind: 'task', task }))
    next = arrayCursor(list, (row) => row.id)
    ids = []
  }
  const found = await api.references(ids, signal).catch(error => {
    if (error instanceof ApiError && error.status === 404) return new Map<string, Reference>()
    throw error
  })
  names.value = new Map([...(after ? names.value : []), ...found])
  return { items, next }
})

watch(tab, () => {
  editing.value = undefined
  composingPending.value = undefined
  success.value = ''
  void rows.reload()
}, { immediate: true })
onMounted(() => void overview.reload())

function key(row: Row) {
  switch (row.kind) {
    case 'vote': return row.vote.id
    case 'review': return row.review.id
    case 'draft': return row.draft.id
    case 'task': return row.task.id
  }
}

async function cancelVote(id: string) {
  const action = { action: 'vote' as const, vote: 0 }
  if (await write.run(`vote:${id}`, action, (body, key) => api.act(id, body, key))) await rows.reload()
}


function remaining(expires: string) {
  const minutes = Math.max(0, Math.ceil((Date.parse(expires) - now.value) / 60_000))
  return t('academic.editor.remaining', { hours: format.value.number(Math.floor(minutes / 60)), minutes: format.value.number(minutes % 60) })
}

async function edit(draft: Draft) {
  editError.value = ''
  try {
    // Open the current saved copy, which another device may have changed.
    const current = await api.draft(draft.id)
    editing.value = current
  } catch (failure) {
    editError.value = errorCode(failure)
  }
}

async function startPending(item: PendingItem) {
  editError.value = ''
  editing.value = undefined
  try {
    const obj = await api.object(item.course_id)
    composingPending.value = { courseId: obj.id, termId: item.term_id, schoolId: obj.school_id }
  } catch (failure) {
    if (campus.value) {
      composingPending.value = { courseId: item.course_id, termId: item.term_id, schoolId: campus.value }
    } else {
      editError.value = errorCode(failure)
    }
  }
}

function edited(result: Result) {
  editing.value = undefined
  composingPending.value = undefined
  success.value = t(result.state === 'pending' ? 'academic.editor.pending' : 'academic.editor.published')
  void overview.reload()
  void rows.reload()
}

async function confirmRemove() {
  const target = removing.value
  if (!target) return
  const result = await write.run(`draft:${target.draft.id}:delete`, { revision: target.draft.revision }, (body, key) => api.deleteDraft(target.draft.id, body, key))
  if (!result) return
  removing.value = undefined
  void rows.reload()
}

async function appeal() {
  const task = appealing.value
  if (!task) return
  const result = await write.run(`appeal:${task.id}`, { object_id: task.submission.object_id, previous_task_id: task.id, kind: 'appeal' as const, reason: appealReason.value.trim(), evidence: [] }, (body, key) => api.submitTask(body, key))
  if (!result) return
  appealing.value = undefined
  appealReason.value = ''
  success.value = t('academic.review.requestSent')
  void rows.reload()
}

async function retry() {
  if (await write.retry()) {
    removing.value = undefined
    appealing.value = undefined
    void rows.reload()
  }
}

function taskState(state: string) {
  return te(`academic.taskState.${state}`) ? t(`academic.taskState.${state}`) : t('academic.taskState.waiting')
}
function updateReview(review: Review) {
  rows.items.value = rows.items.value.map((row) => (row.kind === 'review' && row.review.id === review.id ? { kind: 'review', review } : row))
}
function removeReview(id: string) {
  rows.items.value = rows.items.value.filter((row) => !(row.kind === 'review' && row.review.id === id))
}
</script>

<template>
  <MeLayout
    :title="t('me.reviews')"
    :description="t('me.reviewsIntro')"
  >
    <div class="stack">
      <TabBar
        v-model="tab"
        :tabs="tabs"
        :label="t('me.reviews')"
        id-prefix="my-reviews"
      />
      <div
        id="my-reviews-panel"
        role="tabpanel"
        :aria-labelledby="`my-reviews-tab-${tab}`"
        class="stack"
      >
        <p
          v-if="tab === 'drafts'"
          class="small muted"
        >
          {{ t('me.draftsHint') }}
        </p>
        <p
          v-if="success"
          class="notice notice-success"
          role="status"
        >
          {{ success }}
        </p>
        <MutationNotice
          :busy="write.busy.value"
          :error="write.error.value"
          :uncertain="write.uncertain.value"
          @retry="retry"
        />
        <p
          v-if="editError"
          class="notice notice-error"
          role="alert"
        >
          {{ errorText(editError) }}
        </p>

        <ReviewEditor
          v-if="editing"
          :key="editing.id"
          :kind="editing.input.kind"
          :target-id="editing.input.target_id"
          :school-id="editingSchool"
          :parent-id="editing.parent_id"
          :draft="editing"
          :leave-query="['tab']"
          @submitted="edited"
          @cancel="editing = undefined"
        />

        <ReviewEditor
          v-else-if="composingPending"
          :key="`${composingPending.courseId}:${composingPending.termId}`"
          kind="course"
          :target-id="composingPending.courseId"
          :school-id="composingPending.schoolId"
          :initial-term-id="composingPending.termId"
          :leave-query="['tab']"
          @submitted="edited"
          @cancel="composingPending = undefined; void overview.reload()"
        />

        <template v-else>
          <section
            v-if="tab === 'entries' && pendingCourses.length"
            class="card stack-sm"
            aria-labelledby="pending-courses-title"
          >
            <h2
              id="pending-courses-title"
              class="d-title"
            >
              {{ t('me.pendingCoursesTitle') }}
            </h2>
            <ul class="group">
              <li
                v-for="item in pendingCourses"
                :key="`${item.course_id}:${item.term_id}`"
                class="group-row"
              >
                <span class="group-body">
                  <RouterLink
                    class="group-title"
                    :to="`/courses/${encodeURIComponent(item.course_id)}`"
                  >
                    {{ item.course_name }}
                  </RouterLink>
                  <span class="subtle">{{ item.term_name }}</span>
                </span>
                <button
                  class="btn btn-sm btn-primary"
                  type="button"
                  :disabled="write.busy.value || write.uncertain.value"
                  @click="startPending(item)"
                >
                  {{ t('me.writePendingReview') }}
                </button>
              </li>
            </ul>
          </section>

          <PagedState
            :status="rows.status.value"
            :error="rows.error.value"
            :count="rows.items.value.length"
            :next="rows.next.value"
            :appending="rows.appending.value"
            :empty-text="t(`me.reviewEmpty.${tab}`)"
            @retry="rows.reload"
            @more="rows.loadMore"
          >
            <ul class="list">
              <li
                v-for="row in rows.items.value"
                :key="key(row)"
              >
                <ReviewCard
                  v-if="row.kind === 'review'"
                  :review="row.review"
                  :names="names"
                  @updated="updateReview"
                  @removed="removeReview"
                />
                <article
                  v-else-if="row.kind === 'vote'"
                  class="card stack-sm"
                >
                  <RouterLink :to="`/reviews/${encodeURIComponent(row.vote.root_id)}`">
                    {{ names.get(row.vote.target_id)?.name ?? t('search.votes.review') }}
                  </RouterLink>
                  <p>{{ t(row.vote.my_vote === 1 ? 'search.votes.up' : 'search.votes.down') }}</p>
                  <button
                    type="button"
                    class="btn btn-sm"
                    :disabled="write.busy.value || write.uncertain.value"
                    @click="cancelVote(row.vote.id)"
                  >
                    {{ t('search.votes.cancel') }}
                  </button>
                </article>
                <article
                  v-else-if="row.kind === 'draft'"
                  class="card stack-sm"
                >
                  <div class="row-between">
                    <h3>{{ row.draft.input.title || t('academic.editor.untitled') }}</h3>
                    <StatusTag :tone="row.draft.withdrawn ? 'warning' : 'neutral'">
                      {{ t(row.draft.withdrawn ? 'me.draftWithdrawn' : 'me.draftNormal') }}
                    </StatusTag>
                  </div>
                  <p class="small muted">
                    {{ names.get(row.draft.input.target_id)?.name ?? t('common.unknown') }} · {{ t(`academic.kind.${row.draft.input.kind}`) }}
                  </p>
                  <p class="small truncate">
                    {{ row.draft.input.body }}
                  </p>
                  <p
                    v-if="row.draft.withdrawn && row.draft.expires_at"
                    class="small notice notice-warning"
                  >
                    {{ remaining(row.draft.expires_at) }}
                  </p>
                  <div class="row">
                    <button
                      class="btn btn-sm btn-primary"
                      type="button"
                      :disabled="write.busy.value || write.uncertain.value"
                      @click="edit(row.draft)"
                    >
                      {{ t('me.continueEditing') }}
                    </button>
                    <button
                      v-if="!row.draft.withdrawn"
                      class="btn btn-sm btn-danger"
                      type="button"
                      :disabled="write.busy.value || write.uncertain.value"
                      @click="removing = { kind: 'draft', draft: row.draft }"
                    >
                      {{ t('me.deleteDraft') }}
                    </button>
                  </div>
                </article>
                <article
                  v-else
                  class="card stack-sm"
                >
                  <div class="row-between">
                    <h3>{{ t(`academic.taskKind.${row.task.submission.kind}`) }}</h3>
                    <StatusTag :tone="row.task.state === 'applied' ? 'success' : row.task.state === 'failed' ? 'danger' : 'warning'">
                      {{ taskState(row.task.state) }}
                    </StatusTag>
                  </div>
                  <p
                    v-if="row.task.submission.reason && row.task.submission.reason !== 'content_review'"
                    class="small prewrap"
                  >
                    {{ row.task.submission.reason }}
                  </p>
                  <p class="subtle">
                    {{ t('me.updatedAt', { time: format.dateTime(row.task.updated_at) }) }}
                  </p>
                  <p
                    v-if="row.task.decision?.reason"
                    class="small notice notice-info"
                  >
                    {{ t('me.decisionReason', { reason: row.task.decision.reason }) }}
                  </p>
                  <div class="row">
                    <RouterLink
                      class="btn btn-sm btn-ghost"
                      :to="`${row.task.submission.kind === 'report' ? '/reviews' : '/me/reviews/entries'}/${encodeURIComponent(row.task.submission.object_id)}`"
                    >
                      {{ t('me.viewContent') }}
                    </RouterLink>
                    <button
                      v-if="row.task.can_appeal"
                      class="btn btn-sm"
                      type="button"
                      :disabled="write.busy.value || write.uncertain.value"
                      @click="appealing = row.task; appealReason = ''"
                    >
                      {{ t('me.appeal') }}
                    </button>
                  </div>
                </article>
              </li>
            </ul>
          </PagedState>
        </template>
      </div>
    </div>

    <ConfirmDialog
      :open="!!removing"
      :title="t('me.deleteDraft')"
      :message="t('me.deleteDraftConfirm')"
      :danger="removing?.kind === 'draft'"
      :busy="write.busy.value"
      @confirm="confirmRemove"
      @cancel="removing = undefined"
    />
    <ConfirmDialog
      :open="!!appealing"
      :title="t('me.appeal')"
      :message="t('me.appealHint')"
      :confirm-label="t('common.submit')"
      :busy="write.busy.value"
      @confirm="appeal"
      @cancel="appealing = undefined"
    >
      <label class="field">
        <span class="field-label">{{ t('academic.review.reason') }}</span>
        <textarea
          v-model="appealReason"
          class="textarea"
          rows="4"
          maxlength="2000"
          required
        />
      </label>
    </ConfirmDialog>
  </MeLayout>
</template>
