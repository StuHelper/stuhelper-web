<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useNow } from '../../shared/composables/clock'
import { useMutation, usePaged } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import MeLayout from '../account/MeLayout.vue'
import { arrayCursor, listSize, subjectPath, useAcademic, type CatalogObject, type Draft, type Result, type Review, type Task } from './api'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'

// The author's own reviews, drafts, bookmarked courses, votes and requests.
type Tab = 'entries' | 'drafts' | 'bookmarks' | 'votes' | 'requests'
type Row = { kind: 'review'; review: Review } | { kind: 'draft'; draft: Draft } | { kind: 'bookmark'; id: string } | { kind: 'task'; task: Task }

const { t, te } = useI18n()
const format = useFormat()
const route = useRoute()
const router = useRouter()
const api = useAcademic()
const now = useNow()
const write = useMutation()
const tabNames: Tab[] = ['entries', 'drafts', 'bookmarks', 'votes', 'requests']
const tab = computed<Tab>({
  get: () => tabNames.find((value) => value === route.query.tab) ?? 'entries',
  set: (value) => void router.replace({ query: { ...route.query, tab: value } }),
})
const tabs = computed(() => tabNames.map((value) => ({ value, label: t(`me.reviewTabs.${value}`) })))
const names = shallowRef(new Map<string, CatalogObject>())
const editing = shallowRef<Draft>()
const editError = ref('')
const removing = shallowRef<{ kind: 'draft'; draft: Draft } | { kind: 'bookmark'; id: string }>()
const appealing = shallowRef<Task>()
const appealReason = ref('')
const success = ref('')

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
    items = list.map((review) => ({ kind: 'review', review }))
    next = arrayCursor(list, (row) => row.id)
    ids = list.flatMap((row) => [row.target_id, row.term_id, row.teacher_id])
  } else if (tab.value === 'drafts') {
    const list = await api.myDrafts(query, signal)
    items = list.map((draft) => ({ kind: 'draft', draft }))
    next = arrayCursor(list, (row) => row.id)
    ids = list.map((row) => row.input.target_id)
  } else if (tab.value === 'bookmarks') {
    const list = await api.myBookmarks(query, signal)
    items = list.map((id) => ({ kind: 'bookmark', id }))
    next = arrayCursor(list, (id) => id)
    ids = list
  } else {
    const list = await api.myTasks(query, signal)
    items = list.map((task) => ({ kind: 'task', task }))
    next = arrayCursor(list, (row) => row.id)
    ids = []
  }
  const found = await api.lookup(ids, signal)
  names.value = new Map([...(after ? names.value : []), ...found])
  return { items, next }
})

watch(tab, () => {
  editing.value = undefined
  success.value = ''
  void rows.reload()
}, { immediate: true })

const key = (row: Row) => (row.kind === 'review' ? row.review.id : row.kind === 'draft' ? row.draft.id : row.kind === 'task' ? row.task.id : row.id)

function remaining(expires: string) {
  const minutes = Math.max(0, Math.ceil((Date.parse(expires) - now.value) / 60_000))
  return t('academic.editor.remaining', { hours: format.value.number(Math.floor(minutes / 60)), minutes: format.value.number(minutes % 60) })
}

async function edit(draft: Draft) {
  editError.value = ''
  try {
    // Open the current saved copy, which another device may have changed.
    editing.value = await api.draft(draft.id)
  } catch (failure) {
    editError.value = errorCode(failure)
  }
}

function edited(result: Result) {
  editing.value = undefined
  success.value = t(result.state === 'pending' ? 'academic.editor.pending' : 'academic.editor.published')
  void rows.reload()
}

async function confirmRemove() {
  const target = removing.value
  if (!target) return
  const result = target.kind === 'draft'
    ? await write.run(`draft:${target.draft.id}:delete`, { revision: target.draft.revision }, (body, key) => api.deleteDraft(target.draft.id, body, key))
    : await write.run(`bookmark:${target.id}:unset`, { target_id: target.id, set: false }, (body, key) => api.setBookmark(body, key))
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

function bookmarkPath(id: string) {
  const target = names.value.get(id)
  return target ? subjectPath(target) : ''
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
          {{ t('academic.editor.latestUnavailable') }}
        </p>

        <ReviewEditor
          v-if="editing"
          :key="editing.id"
          :kind="editing.input.kind"
          :target-id="editing.input.target_id"
          :school-id="names.get(editing.input.target_id)?.school_id ?? ''"
          :parent-id="editing.parent_id"
          :draft="editing"
          @submitted="edited"
          @cancel="editing = undefined"
        />

        <PagedState
          v-else
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
                v-else-if="row.kind === 'bookmark'"
                class="card row-between"
              >
                <RouterLink
                  v-if="bookmarkPath(row.id)"
                  :to="bookmarkPath(row.id)"
                >
                  {{ names.get(row.id)?.name }}
                </RouterLink>
                <span
                  v-else
                  class="muted"
                >{{ t('me.bookmarkUnavailable') }}</span>
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="write.busy.value || write.uncertain.value"
                  @click="removing = { kind: 'bookmark', id: row.id }"
                >
                  {{ t('me.removeBookmark') }}
                </button>
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
                    :to="`/reviews/${encodeURIComponent(row.task.submission.object_id)}`"
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
      </div>
    </div>

    <ConfirmDialog
      :open="!!removing"
      :title="t(removing?.kind === 'draft' ? 'me.deleteDraft' : 'me.removeBookmark')"
      :message="t(removing?.kind === 'draft' ? 'me.deleteDraftConfirm' : 'me.removeBookmarkConfirm')"
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
