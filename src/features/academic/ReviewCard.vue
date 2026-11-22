<script setup lang="ts">
import ViolationSelect from '../moderation/ViolationSelect.vue'
import type { ViolationCategory } from '../moderation/categories'
import { useModerationReason } from '../moderation/reason'
import { MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useMutation } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { subjectPath, useAcademic, type NamedObject, type Review, type ReviewAction, type Submission } from './api'
import { reviewLink, safeAvatar, stateTone, useAuthorName } from './presentation'
import RatingBands from './RatingBands.vue'
import ReplyPreview from './ReplyPreview.vue'

const props = withDefaults(defineProps<{ review: Review; names?: ReadonlyMap<string, NamedObject>; standalone?: boolean; appendable?: boolean; replyEnabled?: boolean; hideTarget?: boolean; compact?: boolean }>(), { names: () => new Map(), standalone: false, appendable: false, replyEnabled: false, hideTarget: false, compact: false })
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
const { reason, reasonText, reasonTooLong, reasonCounter, reasonCounterId } = useModerationReason()
const category = ref<ViolationCategory | ''>('')
const proposed = ref('')
const appendBody = ref('')
const success = ref('')

const target = computed(() => props.names.get(props.review.target_id))
const teacher = computed(() => (props.review.teacher_id ? props.names.get(props.review.teacher_id) : undefined))
const term = computed(() => (props.review.term_id ? props.names.get(props.review.term_id) : undefined))
const avatar = computed(() => (props.review.author.anonymous ? '' : safeAvatar(props.review.author.profile?.avatar)))
const locked = computed(() => write.busy.value || write.uncertain.value)
const isRoot = computed(() => props.review.id === props.review.root_id)
const published = computed(() => props.review.state === 'published')
const editWindowMs = 5 * 60_000
const remainingSeconds = ref(0)
// Only course reviews wait out the first-publication window before a follow-up; mentor comments do not.
const appendWaiting = computed(() => props.review.kind === 'course' && remainingSeconds.value > 0)
// When the server still refuses a follow-up, its own reopening time wins over the device clock.
const appendRetryAt = computed(() => (write.error.value === 'append_window_not_open' && write.retryAt.value ? Date.parse(write.retryAt.value) : NaN))
const editCountdownText = computed(() => {
  if (!remainingSeconds.value) return ''
  const mins = Math.floor(remainingSeconds.value / 60)
  const secs = String(remainingSeconds.value % 60).padStart(2, '0')
  return t('academic.review.editWindowRemaining', { time: `${mins}:${secs}` })
})
watch([() => props.review.id, () => props.review.can_edit, () => props.review.published_at], ([id, canEdit, publishedAt], _before, onCleanup) => {
  remainingSeconds.value = 0
  if (!canEdit || !props.review.mine || !publishedAt) return
  const end = Math.min(Date.parse(publishedAt) + editWindowMs, Date.now() + editWindowMs)
  if (!Number.isFinite(end)) return
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  onCleanup(() => { controller.abort(); clearTimeout(timer) })
  // A fast device clock can reach zero before the server closes the edit window.
  // Only the author's server record can change the available actions.
  const retryUntil = Date.now() + editWindowMs + 30_000
  async function refresh() {
    try {
      const current = await api.myEntry(id, controller.signal)
      if (controller.signal.aborted) return
      if (current.revision >= props.review.revision) emit('updated', current)
      if (!current.can_edit) return
    } catch {
      // Preserve the last server decision during a failed background refresh.
    }
    if (!controller.signal.aborted && Date.now() < retryUntil) timer = setTimeout(refresh, 30_000)
  }
  function tick() {
    remainingSeconds.value = Math.max(0, Math.ceil((end - Date.now()) / 1000))
    if (remainingSeconds.value) timer = setTimeout(tick, 1000)
    else void refresh()
  }
  tick()
}, { immediate: true })
// In a list a long body is folded to a few lines. The control appears only when text is actually cut off.
const bodyElement = ref<HTMLElement>()
const expanded = ref(false)
const overflowing = ref(false)
let bodyObserver: ResizeObserver | undefined
const measureBody = () => { if (bodyElement.value && !expanded.value) overflowing.value = bodyElement.value.scrollHeight > bodyElement.value.clientHeight + 1 }
onMounted(() => {
  if (!props.compact || !bodyElement.value) return
  measureBody()
  if (typeof ResizeObserver === 'undefined') return
  bodyObserver = new ResizeObserver(measureBody)
  bodyObserver.observe(bodyElement.value)
})
onBeforeUnmount(() => {
  bodyObserver?.disconnect()
})

// What the pending write does once it succeeds, so a retry of the original request finishes it too.
let finish: (result: never) => void | Promise<void> = () => {}

async function act(action: ReviewAction) {
  success.value = ''
  finish = (result) => acted(action, result)
  const result = await write.run(`act:${props.review.id}:${action.action}`, action, (body, key) => api.act(props.review.id, body, key))
  if (result) await acted(action, result)
}

async function acted(action: ReviewAction, result: { state: string }) {
  if (action.action === 'append') appendBody.value = ''
  if (result.state === 'withdrawn') {
    await router.push({ path: '/me/reviews', query: { tab: 'drafts' } })
    return
  }
  if (action.action === 'delete') {
    emit('removed', props.review.id)
    return
  }
  try {
    emit('updated', props.review.mine ? await api.myEntry(props.review.id) : await api.review(props.review.id))
  } catch {
    // The write succeeded; the list refresh will show the current state.
  }
}

const popped = ref(0)
function vote(value: 1 | -1) {
  popped.value = props.review.my_vote === value ? 0 : value
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
  category.value = ''
  proposed.value = next === 'edit_request' ? props.review.body : ''
  success.value = ''
}

async function submitTask() {
  const kind = panel.value
  if (!kind || !reasonText.value || reasonTooLong.value) return
  if (kind === 'report' && !category.value) return
  const submission: Submission = { object_id: props.review.id, kind, reason: reasonText.value, evidence: [], ...(kind === 'report' && category.value ? { category: category.value } : {}), ...(kind === 'edit_request' ? { proposed_body: proposed.value } : {}) }
  finish = () => submitted(kind)
  const task = await write.run(`task:${props.review.id}:${kind}`, submission, (body, key) => api.submitTask(body, key))
  if (task) submitted(kind)
}

function submitted(kind: Panel) {
  success.value = t(kind === 'report' ? 'academic.review.reportSent' : 'academic.review.requestSent')
  panel.value = ''
}

async function retry() {
  const result = await write.retry()
  if (!write.error.value) {
    panel.value = ''
    confirming.value = ''
    if (result) await finish(result as never)
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
      v-if="target && !standalone && isRoot && !(hideTarget && review.kind !== 'course')"
      class="review-context small"
    >
      <RouterLink
        v-if="!hideTarget"
        :to="subjectPath(target)"
      >
        {{ target.name }}
      </RouterLink>
      <template v-if="review.kind === 'course'">
        {{ hideTarget ? '' : '·' }} {{ teacher ? teacher.name : review.teacher_id ? t('common.unknown') : t('academic.review.noTeacher') }}
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
    <p
      ref="bodyElement"
      class="review-body prewrap"
      :class="{ clamped: compact && !expanded }"
    >
      {{ review.body }}
    </p>
    <section
      v-for="item in review.appends"
      :key="item.id"
      class="stack-sm"
    >
      <strong>{{ t('academic.followUp') }}</strong>
      <p class="prewrap">
        {{ item.body }}
      </p>
      <small v-if="review.mine && item.review_requested">{{ t('verification.states.pending_review') }}</small>
      <small v-else-if="review.mine && item.state === 'rejected'">{{ t('verification.states.rejected') }}</small>
    </section>
    <form
      v-if="(standalone || appendable) && review.mine && isRoot && published"
      class="stack-sm"
      @submit.prevent="act({ action: 'append', revision: review.revision, body: appendBody.trim() })"
    >
      <p
        v-if="Number.isFinite(appendRetryAt)"
        class="small muted"
        role="status"
      >
        {{ t('academic.followUpOpensAt', { time: format.dateTime(appendRetryAt, { dateStyle: 'medium', timeStyle: 'medium' }) }) }}
      </p>
      <p
        v-else-if="appendWaiting && review.published_at"
        class="small muted"
      >
        {{ t('academic.followUpOpensAt', { time: format.dateTime(Date.parse(review.published_at) + editWindowMs) }) }}
      </p>
      <label>{{ t('academic.followUp') }}
        <textarea
          v-model="appendBody"
          maxlength="4000"
          required
          :disabled="locked"
        />
      </label>
      <button
        type="submit"
        class="btn btn-sm"
        :disabled="locked || !appendBody.trim() || appendWaiting"
      >
        {{ t('academic.submitFollowUp') }}
      </button>
    </form>
    <button
      v-if="compact && (overflowing || expanded)"
      class="review-more"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ t(expanded ? 'academic.review.collapse' : 'academic.review.expand') }}
    </button>
    <RatingBands
      v-if="review.kind === 'course' && review.ratings.some((level) => level > 0)"
      :bands="review.ratings.map((level) => ({ level, samples: 1, courses: 1 }))"
      inline
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
        <!-- On a narrow phone the two votes show the thumb and the number; the full wording stays the button's name. -->
        <button
          class="btn btn-sm vote"
          type="button"
          :aria-pressed="review.my_vote === 1"
          :disabled="locked"
          :data-pop="popped === 1 || undefined"
          @click="vote(1)"
          @animationend="popped = 0"
        >
          <ThumbsUp aria-hidden="true" /><span class="vote-word">{{ t('academic.review.upvote', { count: format.number(review.upvotes) }) }}</span><span
            class="vote-count"
            aria-hidden="true"
          >{{ format.number(review.upvotes) }}</span>
        </button>
        <button
          class="btn btn-sm vote"
          type="button"
          :aria-pressed="review.my_vote === -1"
          :disabled="locked"
          :data-pop="popped === -1 || undefined"
          @click="vote(-1)"
          @animationend="popped = 0"
        >
          <ThumbsDown aria-hidden="true" /><span class="vote-word">{{ t('academic.review.downvote', { count: format.number(review.downvotes) }) }}</span><span
            class="vote-count"
            aria-hidden="true"
          >{{ format.number(review.downvotes) }}</span>
        </button>
        <button
          v-if="replyEnabled"
          class="btn btn-sm"
          type="button"
          :disabled="locked"
          @click="emit('reply', review)"
        >
          <MessageCircle aria-hidden="true" />{{ t('academic.review.reply') }}
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
        <span
          v-if="editCountdownText"
          class="subtle mono"
        >{{ editCountdownText }}</span>
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
      <ViolationSelect
        v-if="panel === 'report'"
        v-model="category"
        :disabled="locked"
      />
      <div class="field">
        <label class="field">
          <span class="field-label">{{ t('academic.review.reason') }}</span>
          <textarea
            v-model="reason"
            class="textarea"
            rows="3"
            required
            :disabled="locked"
            :aria-invalid="reasonTooLong || undefined"
            :aria-describedby="reasonCounterId"
          />
        </label>
        <bdi
          :id="reasonCounterId"
          :class="reasonTooLong ? 'field-error' : 'field-hint'"
          dir="ltr"
        >{{ reasonCounter }}</bdi>
      </div>
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
          :disabled="locked || !reasonText || reasonTooLong || (panel === 'report' && !category)"
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
      v-if="!confirming"
      :busy="write.busy.value"
      :error="Number.isFinite(appendRetryAt) ? '' : write.error.value"
      :uncertain="write.uncertain.value"
      :success="success"
      @retry="retry"
    />

    <ReplyPreview
      v-if="compact && isRoot && published"
      :root-id="review.id"
      :to="reviewLink(review)"
      :preview="review.reply_preview"
      :count="review.reply_count"
    />
    <ConfirmDialog
      :open="confirming !== ''"
      :title="t(confirming === 'delete' ? 'academic.review.deleteTitle' : 'academic.review.withdrawTitle')"
      :message="t(confirming === 'delete' ? (isRoot ? 'academic.review.deleteRootConfirm' : 'academic.review.deleteReplyConfirm') : 'academic.review.withdrawConfirm')"
      :confirm-label="t(confirming === 'delete' ? 'academic.review.delete' : 'academic.review.withdraw')"
      :danger="confirming === 'delete'"
      :busy="write.busy.value"
      :error="write.error.value"
      :uncertain="write.uncertain.value"
      @retry="retry"
      @confirm="confirm"
      @cancel="confirming = ''"
    />
  </article>
</template>

<style scoped>
.review { display: grid; gap: .75rem; }
.review.reply { box-shadow: none; background: color-mix(in srgb, var(--surface) 60%, transparent); }
.review-head { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; }
.review-author { display: flex; align-items: center; gap: .625rem; min-width: 0; }
.review-author img, .review-avatar { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.review-avatar { display: grid; place-items: center; background: var(--fill-strong); color: var(--label-2); font-weight: 600; }
.review-byline { gap: 0; }
.review-name { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .375rem; font-size: .9375rem; font-weight: 600; }
.review-title { font-size: 1.1875rem; font-weight: 650; letter-spacing: var(--tracking-title); }
.review-title a { color: inherit; }
.review-title a:hover { color: var(--accent); text-decoration: none; }
.review-context { color: var(--label-2); }
.review-body.clamped { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 5; line-clamp: 5; -webkit-box-orient: vertical; }
.review-more { justify-self: start; padding: 0; border: 0; background: none; color: var(--accent); font: inherit; font-size: .875rem; font-weight: 550; cursor: pointer; }
.review-more:hover { text-decoration: underline; text-underline-offset: .15em; }
.review-actions { gap: .25rem .375rem; margin-block-start: .25rem; }
/* The quiet actions take less room, so the four actions of a review fit one line on phones. */
.review-actions .btn-ghost { padding-inline: .625rem; }
.vote { position: relative; }
.vote-count { display: none; font-variant-numeric: tabular-nums; }
@media (max-width: 480px) {
  .vote-word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .vote-count { display: inline; }
}
.review-panel { padding: 1rem; border-radius: var(--radius); background: var(--fill); }
.review-panel .input, .review-panel .textarea { background: var(--surface); }
</style>
