<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useMutation } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { subjectPath, useAcademic, type CatalogObject, type Review, type ReviewAction, type Submission } from './api'
import { reviewLink, safeAvatar, stateTone, useAuthorName } from './presentation'
import RatingBands from './RatingBands.vue'

const props = withDefaults(defineProps<{ review: Review; names?: Map<string, CatalogObject>; standalone?: boolean; replyEnabled?: boolean }>(), { names: () => new Map(), standalone: false, replyEnabled: false })
const emit = defineEmits<{ updated: [review: Review]; removed: [id: string]; reply: [review: Review] }>()
const { t } = useI18n()
const format = useFormat()
const router = useRouter()
const api = useAcademic()
const write = useMutation()
const authorName = useAuthorName()

type Panel = '' | 'report' | 'edit_request' | 'delete_request'
const panel = ref<Panel>('')
const confirming = ref<'' | 'withdraw' | 'delete'>('')
const reason = ref('')
const proposed = ref('')
const success = ref('')

const target = computed(() => props.names.get(props.review.target_id))
const teacher = computed(() => (props.review.teacher_id ? props.names.get(props.review.teacher_id) : undefined))
const term = computed(() => (props.review.term_id ? props.names.get(props.review.term_id) : undefined))
const avatar = computed(() => (props.review.author.anonymous ? '' : safeAvatar(props.review.author.profile?.avatar)))
const locked = computed(() => write.busy.value || write.uncertain.value)
const isRoot = computed(() => props.review.id === props.review.root_id)
const published = computed(() => props.review.state === 'published')

async function act(action: ReviewAction) {
  success.value = ''
  const result = await write.run(`act:${props.review.id}:${action.action}`, action, (body, key) => api.act(props.review.id, body, key))
  if (!result) return
  if (result.state === 'withdrawn') {
    await router.push({ path: '/me/reviews', query: { tab: 'drafts' } })
    return
  }
  if (action.action === 'delete') {
    emit('removed', props.review.id)
    return
  }
  try {
    emit('updated', props.review.mine && props.review.state !== 'published' ? await api.myEntry(props.review.id) : await api.review(props.review.id))
  } catch {
    // The write succeeded; the list refresh will show the current state.
  }
}

function vote(value: 1 | -1) {
  void act({ action: 'vote', revision: props.review.revision, vote: props.review.my_vote === value ? 0 : value })
}

async function confirm() {
  const action = confirming.value
  if (!action) return
  await act({ action, revision: props.review.revision })
  if (!write.error.value) confirming.value = ''
}

function openPanel(next: Panel) {
  panel.value = panel.value === next ? '' : next
  reason.value = ''
  proposed.value = next === 'edit_request' ? props.review.body : ''
  success.value = ''
}

async function submitTask() {
  const kind = panel.value
  if (!kind) return
  const submission: Submission = { object_id: props.review.id, kind, reason: reason.value.trim(), evidence: [], ...(kind === 'edit_request' ? { proposed_body: proposed.value } : {}) }
  const task = await write.run(`task:${props.review.id}:${kind}`, submission, (body, key) => api.submitTask(body, key))
  if (!task) return
  success.value = t(kind === 'report' ? 'academic.review.reportSent' : 'academic.review.requestSent')
  panel.value = ''
}

async function retry() {
  await write.retry()
  if (!write.error.value) {
    panel.value = ''
    confirming.value = ''
  }
}
</script>

<template>
  <article
    :id="`review-${review.id}`"
    class="card review"
    :class="{ reply: !isRoot }"
  >
    <header class="review-head">
      <div class="review-author">
        <img
          v-if="avatar"
          :src="avatar"
          alt=""
          width="32"
          height="32"
          loading="lazy"
          referrerpolicy="no-referrer"
        >
        <span
          v-else
          class="review-avatar"
          aria-hidden="true"
        >{{ [...authorName(review)][0] }}</span>
        <div class="stack-sm review-byline">
          <span class="review-name">{{ authorName(review) }}
            <StatusTag
              v-if="!isRoot && review.author.handle === 'author'"
              tone="info"
            >{{ t('academic.author.op') }}</StatusTag>
            <StatusTag
              v-if="review.featured"
              tone="success"
            >{{ t('academic.review.featured') }}</StatusTag>
          </span>
          <span class="subtle">
            <time
              v-if="review.published_at"
              :datetime="review.published_at"
            >{{ format.dateTime(review.published_at) }}</time>
            <template v-if="term"> · {{ term.name }}</template>
          </span>
        </div>
      </div>
      <StatusTag
        v-if="review.mine"
        :tone="stateTone(review.state)"
      >
        {{ t(`academic.state.${review.state}`) }}
      </StatusTag>
    </header>

    <p
      v-if="target && !standalone && isRoot"
      class="review-context small"
    >
      <RouterLink :to="subjectPath(target)">
        {{ target.name }}
      </RouterLink>
      <template v-if="review.kind === 'course'">
        · {{ teacher ? teacher.name : review.teacher_id ? t('common.unknown') : t('academic.review.noTeacher') }}
      </template>
    </p>

    <h3
      v-if="review.title"
      class="review-title"
    >
      <span v-if="standalone">{{ review.title }}</span>
      <RouterLink
        v-else
        :to="reviewLink(review)"
      >
        {{ review.title }}
      </RouterLink>
    </h3>
    <p class="review-body prewrap">
      {{ review.body }}
    </p>
    <p
      v-if="review.preview"
      class="notice notice-info small"
    >
      {{ t('academic.review.preview') }}
    </p>

    <RatingBands
      v-if="review.kind === 'course' && !review.preview && review.ratings.some((level) => level > 0)"
      :bands="review.ratings.map((level) => ({ level, samples: 1, courses: 1 }))"
      :school-id="review.school_id"
      :samples="false"
      compact
    />

    <ul
      v-if="review.author.disclosures?.length"
      class="row disclosures"
      :aria-label="t('academic.disclosure.shown')"
    >
      <li
        v-for="option in review.author.disclosures"
        :key="option.key"
        class="tag tag-info"
      >
        {{ t(`academic.disclosure.labels.${option.key}`) }}<template v-if="option.key === 'enrollment'">
          · {{ t(`academic.disclosure.enrollment.${option.value}`) }}
        </template><template v-else-if="option.key !== 'teacher' && option.key !== 'real_name'">
          · {{ option.value }}
        </template>
      </li>
    </ul>

    <div class="row review-actions">
      <template v-if="published">
        <button
          class="btn btn-sm"
          type="button"
          :aria-pressed="review.my_vote === 1"
          :disabled="locked"
          @click="vote(1)"
        >
          {{ t('academic.review.upvote', { count: format.number(review.upvotes) }) }}
        </button>
        <button
          class="btn btn-sm"
          type="button"
          :aria-pressed="review.my_vote === -1"
          :disabled="locked"
          @click="vote(-1)"
        >
          {{ t('academic.review.downvote', { count: format.number(review.downvotes) }) }}
        </button>
        <button
          v-if="replyEnabled"
          class="btn btn-sm"
          type="button"
          :disabled="locked"
          @click="emit('reply', review)"
        >
          {{ t('academic.review.reply') }}
        </button>
        <RouterLink
          v-if="!standalone && isRoot"
          class="btn btn-sm btn-ghost"
          :to="reviewLink(review)"
        >
          {{ t('academic.review.openDiscussion') }}
        </RouterLink>
        <button
          v-if="!review.mine"
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="locked"
          :aria-expanded="panel === 'report'"
          @click="openPanel('report')"
        >
          {{ t('academic.review.report') }}
        </button>
      </template>
      <template v-if="review.can_edit">
        <button
          class="btn btn-sm"
          type="button"
          :disabled="locked"
          @click="confirming = 'withdraw'"
        >
          {{ t('academic.review.withdraw') }}
        </button>
        <button
          class="btn btn-sm btn-danger"
          type="button"
          :disabled="locked"
          @click="confirming = 'delete'"
        >
          {{ t('academic.review.delete') }}
        </button>
      </template>
      <template v-else-if="review.mine && review.state !== 'deleted'">
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="locked"
          :aria-expanded="panel === 'edit_request'"
          @click="openPanel('edit_request')"
        >
          {{ t('academic.review.requestEdit') }}
        </button>
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="locked"
          :aria-expanded="panel === 'delete_request'"
          @click="openPanel('delete_request')"
        >
          {{ t('academic.review.requestDelete') }}
        </button>
      </template>
    </div>

    <form
      v-if="panel"
      class="review-panel stack"
      @submit.prevent="submitTask"
    >
      <p class="small muted">
        {{ t(`academic.review.panelHint.${panel}`) }}
      </p>
      <label class="field">
        <span class="field-label">{{ t('academic.review.reason') }}</span>
        <textarea
          v-model="reason"
          class="textarea"
          rows="3"
          maxlength="2000"
          required
          :disabled="locked"
        />
      </label>
      <label
        v-if="panel === 'edit_request'"
        class="field"
      >
        <span class="field-label">{{ t('academic.review.proposedBody') }}</span>
        <textarea
          v-model="proposed"
          class="textarea"
          rows="8"
          maxlength="16000"
          required
          :disabled="locked"
        />
      </label>
      <div class="form-actions">
        <button
          class="btn btn-primary btn-sm"
          type="submit"
          :disabled="locked || !reason.trim()"
        >
          {{ t('common.submit') }}
        </button>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="locked"
          @click="panel = ''"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </form>

    <MutationNotice
      :busy="write.busy.value"
      :error="write.error.value"
      :uncertain="write.uncertain.value"
      :success="success"
      @retry="retry"
    />

    <ConfirmDialog
      :open="confirming !== ''"
      :title="t(confirming === 'delete' ? 'academic.review.deleteTitle' : 'academic.review.withdrawTitle')"
      :message="t(confirming === 'delete' ? (isRoot ? 'academic.review.deleteRootConfirm' : 'academic.review.deleteReplyConfirm') : 'academic.review.withdrawConfirm')"
      :confirm-label="t(confirming === 'delete' ? 'academic.review.delete' : 'academic.review.withdraw')"
      :danger="confirming === 'delete'"
      :busy="write.busy.value"
      @confirm="confirm"
      @cancel="confirming = ''"
    />
  </article>
</template>

<style scoped>
.review { display: grid; gap: .7rem; }
.review.reply { background: var(--surface); border-inline-start: 3px solid var(--accent-soft); }
.review-head { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; }
.review-author { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.review-author img, .review-avatar { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.review-avatar { display: grid; place-items: center; background: var(--surface-muted); color: var(--muted); font-weight: 700; }
.review-byline { gap: 0; }
.review-name { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .35rem; font-weight: 620; }
.review-title { font-size: 1.05rem; }
.review-title a { color: inherit; text-decoration: none; }
.review-title a:hover { color: var(--accent); }
.review-body { color: var(--text); }
.disclosures { list-style: none; }
.review-panel { padding: .9rem; border-radius: var(--radius-sm); background: var(--surface-muted); }
</style>
