<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useNow } from '../../shared/composables/clock'
import { useAsync, useMutation } from '../../shared/composables/async'
import { useLeaveGuard } from '../../shared/composables/leave'
import { useSession } from '../../shared/session'
import AsyncState from '../../shared/ui/AsyncState.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useAcademic, type DisclosureKey, type Draft, type Result, type ReviewAction, type ReviewInput, type ReviewKind } from './api'
import { askConfirm } from '../../shared/ui/confirm'
import ChoiceGroup from './ChoiceGroup.vue'
import RatingInput from './RatingInput.vue'

/**
 * Write a course review, a mentor review or a reply. The server's composer
 * reports the current eligibility, teacher candidates from the author's own
 * enrollment and the discussion identity; the page only presents them.
 */
const props = withDefaults(defineProps<{ kind: ReviewKind; targetId: string; schoolId: string; parentId?: string; draft?: Draft; leaveQuery?: readonly string[] }>(), { parentId: undefined, draft: undefined, leaveQuery: undefined })
const emit = defineEmits<{ submitted: [result: Result]; cancel: [] }>()
const { t } = useI18n()
const format = useFormat()
const api = useAcademic()
const session = useSession()
const write = useMutation()
const now = useNow()

const original = props.draft?.input
const withdrawn = props.draft?.withdrawn === true
const title = ref(original?.title ?? '')
const body = ref(original?.body ?? (props.kind === 'mentor' ? t('academic.editor.mentorTemplate') : ''))
const term = ref(original?.term_id ?? '')
const teacher = ref(original?.teacher_id ?? '')
const signed = ref(original?.signed ?? false)
const ratings = ref<number[]>(original?.ratings.slice() ?? [0, 0, 0, 0, 0])
const disclosures = ref<DisclosureKey[]>(original?.disclosures?.slice() ?? [])
const draftId = ref(props.draft?.id ?? '')
const revision = ref(props.draft?.revision ?? 0)
const expires = ref(props.draft?.expires_at)
const success = ref('')
const latest = shallowRef<Draft>()
const latestError = ref('')
let restoring = false

const terms = useAsync((signal) => (props.kind === 'course' ? api.options({ kind: 'term', school_id: props.schoolId }, signal) : Promise.resolve([])))
const context = useAsync(async (signal) => {
  const composer = await api.composer({ kind: props.kind, target_id: props.targetId, term_id: props.kind === 'course' ? term.value : undefined, parent_id: props.kind === 'reply' ? props.parentId : undefined }, signal)
  const names = await api.lookup([...composer.teacher_ids, teacher.value], signal)
  return { composer, names }
})
const composer = computed(() => context.data.value?.composer)
const identity = computed(() => (withdrawn ? (signed.value ? 'signed' : 'anonymous') : (composer.value?.identity ?? 'choice')))
const teacherOptions = computed(() => {
  const ids = composer.value?.teacher_ids ?? []
  // A withdrawn review keeps its original teacher even if enrollment changed since.
  return withdrawn && teacher.value && !ids.includes(teacher.value) ? [...ids, teacher.value] : ids
})
const termChoices = computed(() => (terms.data.value ?? []).map((item) => ({ value: item.id, label: item.name })))
const teacherChoices = computed(() => [
  { value: '', label: t('academic.review.noTeacher') },
  ...teacherOptions.value.map((id) => ({ value: id, label: context.data.value?.names.get(id)?.name ?? t('common.unknown') })),
])

function input(): ReviewInput {
  return {
    kind: props.kind,
    target_id: props.targetId,
    title: props.kind === 'reply' ? '' : title.value,
    body: body.value,
    ratings: props.kind === 'course' ? ratings.value.slice() : [0, 0, 0, 0, 0],
    signed: signed.value,
    ...(disclosures.value.length ? { disclosures: disclosures.value.slice() } : {}),
    ...(props.kind === 'course' ? { term_id: term.value, teacher_id: teacher.value } : {}),
  }
}
const baseline = ref(JSON.stringify(input()))
const dirty = computed(() => JSON.stringify(input()) !== baseline.value)
const locked = computed(() => write.busy.value || write.uncertain.value)
// 条件全部满足时不打扰作者。选择学期属于填写步骤，由下方的学期选项提示。
const showEligibility = computed(() => {
  if (!composer.value) return context.status.value === 'error'
  return (!composer.value.allowed && composer.value.state !== 'choose_term') || composer.value.requirements.some((item) => item.state !== 'satisfied')
})
// 课程评价发布时五个维度都要评分。草稿可以只填一部分。
const ratingsMissing = computed(() => props.kind === 'course' && ratings.value.some((level) => !level))
const canPublish = computed(() => !locked.value && composer.value?.allowed === true && !ratingsMissing.value && (props.kind !== 'course' || !!term.value) && !!body.value.trim() && (props.kind === 'reply' || !!title.value.trim()))
const remaining = computed(() => {
  if (!expires.value) return ''
  const minutes = Math.max(0, Math.ceil((Date.parse(expires.value) - now.value) / 60_000))
  return t('academic.editor.remaining', { hours: format.value.number(Math.floor(minutes / 60)), minutes: format.value.number(minutes % 60) })
})

watch(term, () => {
  if (!withdrawn && !restoring) teacher.value = ''
  if (props.kind === 'course') void context.reload()
})
watch(() => props.parentId, () => {
  if (props.kind === 'reply') void context.reload()
})
watch(() => composer.value?.identity, (mode) => {
  if (!withdrawn && mode && mode !== 'choice') signed.value = mode === 'signed'
})
// Required disclosures (for example a teacher replying on an own course) are always selected.
watch(() => composer.value?.disclosures, (options) => {
  if (!options) return
  const offered = new Set(options.map((option) => option.key))
  disclosures.value = [...new Set([...disclosures.value.filter((key) => offered.has(key)), ...options.filter((option) => option.required).map((option) => option.key)])]
})

// Steps open in a new tab so the text being written stays here; returning rechecks.
const steps: Record<string, string> = { campus_eligibility: '/me/verification', identity_verified: '/me/account/identity', course_enrollment: '/me/courses' }
function recheck() {
  if (document.visibilityState === 'visible' && context.status.value !== 'loading' && !locked.value) void context.reload()
}
document.addEventListener('visibilitychange', recheck)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', recheck))

useLeaveGuard(() => (write.uncertain.value ? t('common.leaveUncertain') : dirty.value || write.busy.value ? t('common.leaveUnsaved') : ''), { query: props.leaveQuery })
onMounted(() => {
  void terms.reload()
  void context.reload()
})

async function submit(saveDraft: boolean) {
  success.value = ''
  latest.value = undefined
  const payload = input()
  let result: Result | undefined
  if (withdrawn) {
    const action: ReviewAction = { action: saveDraft ? 'save_withdrawn' : 'republish', revision: revision.value, input: payload }
    result = await write.run(`withdrawn:${draftId.value}:${action.action}`, action, (body, key) => api.act(draftId.value, body, key))
  } else if (saveDraft) {
    result = await write.run('draft:save', { ...(draftId.value ? { id: draftId.value } : {}), revision: revision.value, input: payload }, (body, key) => api.saveDraft(body, key))
  } else if (draftId.value) {
    result = await write.run(`draft:${draftId.value}:publish`, { revision: revision.value, input: payload }, (body, key) => api.publishDraft(draftId.value, body, key))
  } else if (props.kind === 'reply' && props.parentId) {
    const parent = props.parentId
    result = await write.run(`reply:${parent}`, payload, (body, key) => api.reply(parent, body, key))
  } else {
    result = await write.run('publish', payload, (body, key) => api.publish(body, key))
  }
  if (result) settled(result)
}

async function retry() {
  const result = await write.retry()
  // The retried request returns the same contract Result as the original.
  if (result) settled(result as Result)
}

function settled(result: Result) {
  baseline.value = JSON.stringify(input())
  if (result.state === 'draft' || result.state === 'withdrawn') {
    draftId.value = result.id
    revision.value = result.revision
    expires.value = result.expires_at ?? expires.value
    success.value = t('academic.editor.draftSaved')
    return
  }
  emit('submitted', result)
}

async function loadLatest() {
  latestError.value = ''
  try {
    latest.value = await api.draft(draftId.value)
  } catch {
    latestError.value = 'unavailable'
  }
}

async function useLatest() {
  const data = latest.value
  if (!data) return
  restoring = true
  title.value = data.input.title
  body.value = data.input.body
  term.value = data.input.term_id ?? ''
  teacher.value = data.input.teacher_id ?? ''
  signed.value = data.input.signed
  ratings.value = data.input.ratings.slice()
  disclosures.value = data.input.disclosures?.slice() ?? []
  revision.value = data.revision
  expires.value = data.expires_at
  baseline.value = JSON.stringify(input())
  latest.value = undefined
  write.dismiss()
  await nextTick()
  restoring = false
}

/** Keep the text on screen and overwrite the saved copy on the next save. */
function keepMine() {
  if (!latest.value) return
  revision.value = latest.value.revision
  expires.value = latest.value.expires_at
  latest.value = undefined
  write.dismiss()
}

async function cancel() {
  if (dirty.value && !(await askConfirm(t('common.leaveUnsaved')))) return
  emit('cancel')
}
</script>

<template>
  <form
    class="card editor stack"
    novalidate
    @submit.prevent="submit(false)"
  >
    <header class="stack-sm">
      <h2>{{ t(`academic.editor.heading.${kind}`) }}</h2>
      <p class="small muted">
        {{ t('academic.editor.identityHint') }}
      </p>
    </header>

    <section
      v-if="showEligibility"
      class="eligibility"
      :aria-label="t('academic.editor.eligibility')"
    >
      <AsyncState
        :status="context.status.value"
        :error="context.error.value"
        @retry="context.reload"
      >
        <template v-if="composer">
          <ul class="row eligibility-list">
            <li
              v-for="requirement in composer.requirements"
              :key="requirement.key"
            >
              <StatusTag :tone="requirement.state === 'satisfied' ? 'success' : requirement.state === 'missing' ? 'warning' : 'neutral'">
                {{ t(`academic.requirement.${requirement.key}`) }} · {{ t(`academic.requirementState.${requirement.state}`) }}
              </StatusTag>
              <a
                v-if="requirement.state === 'missing' && steps[requirement.key]"
                class="eligibility-step"
                :href="steps[requirement.key]"
                target="_blank"
              >{{ t(`academic.requirementStep.${requirement.key}`) }}</a>
              <span
                v-else-if="requirement.state === 'missing' && requirement.key === 'phone_bound'"
                class="subtle"
              >{{ t('me.status.phoneHint') }}</span>
            </li>
          </ul>
          <p
            class="small"
            :class="composer.allowed ? 'muted' : ''"
          >
            {{ t(`academic.composer.${composer.state}`) }}
          </p>
          <div class="row">
            <button
              v-if="composer.state === 'unauthenticated' && session.state.value !== 'member'"
              class="btn btn-sm btn-primary"
              type="button"
              @click="session.signIn"
            >
              {{ t('account.signIn') }}
            </button>
            <button
              class="btn btn-sm btn-ghost"
              type="button"
              :disabled="context.status.value === 'loading'"
              @click="context.reload"
            >
              {{ t('academic.editor.refreshEligibility') }}
            </button>
          </div>
        </template>
      </AsyncState>
    </section>

    <p
      v-if="expires && withdrawn"
      class="notice notice-warning small"
    >
      {{ remaining }}
    </p>

    <fieldset
      class="stack"
      :disabled="locked"
    >
      <p
        v-if="composer?.state === 'choose_term'"
        class="small muted"
      >
        {{ t('academic.composer.choose_term') }}
      </p>
      <template v-if="kind === 'course'">
        <ChoiceGroup
          v-model="term"
          :label="t('academic.editor.term')"
          :options="termChoices"
          :disabled="withdrawn"
          :limit="6"
          :more-label="t('academic.editor.moreTerms')"
        />
        <p
          v-if="terms.status.value === 'error'"
          class="field-error"
        >
          {{ t('academic.editor.termsUnavailable') }}
        </p>
        <div
          v-if="term"
          class="field"
        >
          <ChoiceGroup
            v-model="teacher"
            :label="t('academic.editor.teacher')"
            :options="teacherChoices"
            :disabled="withdrawn"
          />
          <span class="field-hint">{{ t('academic.editor.teacherHint') }}</span>
        </div>
      </template>

      <RatingInput
        v-if="kind === 'course'"
        v-model="ratings"
        :school-id="schoolId"
        :disabled="locked"
      />
      <p
        v-if="ratingsMissing"
        class="field-hint"
      >
        {{ t('academic.editor.ratingsRequired') }}
      </p>

      <label
        v-if="kind !== 'reply'"
        class="field"
      >
        <span class="field-label">{{ t('academic.editor.title') }}</span>
        <input
          v-model="title"
          class="input"
          maxlength="200"
          required
        >
      </label>
      <label class="field">
        <span class="field-label">{{ t('academic.editor.body') }}</span>
        <textarea
          v-model="body"
          class="textarea"
          :rows="kind === 'reply' ? 4 : 10"
          maxlength="16000"
          required
        />
      </label>
      <p
        v-if="kind === 'mentor'"
        class="field-hint"
      >
        {{ t('academic.editor.templateHint') }}
      </p>

      <label
        v-if="identity === 'choice'"
        class="check"
      >
        <input
          v-model="signed"
          type="checkbox"
        >
        <span>{{ t('academic.editor.signed') }}</span>
      </label>
      <p
        v-if="identity === 'choice'"
        class="field-hint"
      >
        {{ t('academic.editor.signedHint') }}
      </p>
      <p
        v-else
        class="small muted"
      >
        {{ t(identity === 'signed' ? 'academic.editor.identitySigned' : 'academic.editor.identityAnonymous') }}
      </p>

      <fieldset
        v-if="composer?.disclosures?.length"
        class="stack-sm"
      >
        <legend>{{ t('academic.disclosure.title') }}</legend>
        <p class="field-hint">
          {{ t(composer.teacher_reply ? 'academic.disclosure.teacherRequired' : 'academic.disclosure.hint') }}
        </p>
        <label
          v-for="option in composer.disclosures"
          :key="option.key"
          class="check"
        >
          <input
            v-model="disclosures"
            type="checkbox"
            :value="option.key"
            :disabled="option.required"
          >
          <span>{{ t(`academic.disclosure.labels.${option.key}`) }}<template v-if="option.key === 'enrollment'"> · {{ t(`academic.disclosure.enrollment.${option.value}`) }}</template><template v-else-if="option.key !== 'teacher'"> · {{ option.value }}</template></span>
        </label>
      </fieldset>
    </fieldset>

    <MutationNotice
      :busy="write.busy.value"
      :error="write.error.value"
      :uncertain="write.uncertain.value"
      :success="success"
      @retry="retry"
    />

    <section
      v-if="write.error.value === 'conflict' && draftId"
      class="notice notice-warning stack"
    >
      <p>{{ t('academic.editor.conflict') }}</p>
      <div class="row">
        <button
          class="btn btn-sm"
          type="button"
          @click="loadLatest"
        >
          {{ t('academic.editor.loadLatest') }}
        </button>
      </div>
      <p
        v-if="latestError"
        role="alert"
      >
        {{ t('academic.editor.latestUnavailable') }}
      </p>
      <div
        v-if="latest"
        class="stack-sm"
      >
        <h3>{{ latest.input.title || t('academic.editor.untitled') }}</h3>
        <p class="prewrap small">
          {{ latest.input.body }}
        </p>
        <div class="row">
          <button
            class="btn btn-sm"
            type="button"
            @click="useLatest"
          >
            {{ t('academic.editor.useLatest') }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            @click="keepMine"
          >
            {{ t('academic.editor.keepMine') }}
          </button>
        </div>
      </div>
    </section>

    <div class="form-actions">
      <button
        class="btn btn-primary"
        type="submit"
        :disabled="!canPublish"
      >
        {{ t(withdrawn ? 'academic.editor.republish' : 'academic.editor.publish') }}
      </button>
      <button
        v-if="kind !== 'reply' || withdrawn"
        class="btn"
        type="button"
        :disabled="locked"
        @click="submit(true)"
      >
        {{ t('academic.editor.saveDraft') }}
      </button>
      <button
        class="btn btn-ghost"
        type="button"
        :disabled="write.busy.value"
        @click="cancel"
      >
        {{ t('common.cancel') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.editor { box-shadow: var(--shadow-lift); animation: reveal .45s var(--ease-out); }
.eligibility { display: grid; gap: .5rem; padding: .875rem 1rem; border-radius: var(--radius); background: var(--fill); }
</style>
