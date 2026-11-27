<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useNow } from '../../shared/composables/clock'
import { useAsync, useMutation } from '../../shared/composables/async'
import { useLeaveGuard } from '../../shared/composables/leave'
import { useSession } from '../../shared/session'
import AsyncState from '../../shared/ui/AsyncState.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useAcademic, type DisclosureKey, type Draft, type Grade, type Result, type ReviewAction, type ReviewInput, type ReviewKind } from './api'
import { askConfirm } from '../../shared/ui/confirm'
import { ShieldCheck } from 'lucide-vue-next'
import { useVerification } from '../verification/api'
import ChoiceGroup from './ChoiceGroup.vue'
import EnrollmentBadge from './EnrollmentBadge.vue'
import GradeInput from './GradeInput.vue'
import RatingInput from './RatingInput.vue'

/**
 * Write a course review, a mentor review or a reply. The server's composer
 * reports the current eligibility, the terms in which the course ran, the public
 * teachers of the chosen term and the discussion identity; the page only presents them.
 * Under an active school data authorization the composer marks the terms and teachers
 * from the author's own enrollment, which the page highlights. Several teachers may be
 * chosen, or none.
 */
const props = withDefaults(defineProps<{ kind: ReviewKind; targetId: string; schoolId: string; parentId?: string; draft?: Draft; initialTermId?: string; initialTeacherIds?: readonly string[]; leaveQuery?: readonly string[] }>(), { parentId: undefined, draft: undefined, initialTermId: undefined, initialTeacherIds: undefined, leaveQuery: undefined })
const emit = defineEmits<{ submitted: [result: Result]; cancel: [] }>()
const { t } = useI18n()
const format = useFormat()
const api = useAcademic()
const session = useSession()
const write = useMutation()
const now = useNow()

const textOnly = computed(() => !!props.draft && !props.schoolId)
const original = props.draft?.input
const withdrawn = props.draft?.withdrawn === true
const title = ref(original?.title ?? '')
// New course and mentor reviews start from an editable template. Text that is only
// the untouched template does not count as written content.
const template = props.kind === 'mentor' ? t('academic.editor.mentorTemplate') : props.kind === 'course' ? t('academic.editor.courseTemplate') : ''
const body = ref(original?.body ?? template)
const bodyWritten = computed(() => !!body.value.trim() && body.value.trim() !== template.trim())
const term = ref(original?.term_id ?? props.initialTermId ?? '')
// An own enrollment opened from the review launcher brings its term and all of its teachers.
const teachers = ref<string[]>(original?.teacher_ids?.slice() ?? props.initialTeacherIds?.slice() ?? [])
const grade = ref<Grade | undefined>(original?.grade)
const gradeIncomplete = ref(false)
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

// Whether this author's course reviews will carry a checked enrollment status. Only a course
// review needs it; a failed read just leaves the explanation out.
const verification = useVerification()
const schoolData = useAsync((signal) => (props.kind === 'course' && !textOnly.value && session.state.value === 'member' ? verification.schoolData(signal) : Promise.resolve(undefined)))
void schoolData.reload()
// Enrollment is checked only for terms up to the authorized term; later terms are labeled unknown.
const enrollmentNote = computed(() => {
  const value = schoolData.data.value
  if (!value || value.state === 'inactive') return t('academic.editor.enrollmentInactive')
  const term = value.authorized_through ? t('verification.schoolData.term', { year: format.value.number(value.authorized_through.year, { useGrouping: false }), season: t(`verification.schoolData.seasons.${value.authorized_through.season}`) }) : ''
  if (value.state === 'historical') return term ? t('academic.editor.enrollmentHistorical', { term }) : t('academic.editor.enrollmentInactive')
  return term ? t('academic.editor.enrollmentActiveThrough', { term }) : t('academic.editor.enrollmentActive')
})
const context = useAsync(async (signal) => {
  const composer = await api.composer({ kind: props.kind, target_id: props.targetId, term_id: props.kind === 'course' ? term.value : undefined, parent_id: props.kind === 'reply' ? props.parentId : undefined }, signal)
  const names = await api.lookup([...composer.teachers.map((item) => item.id), ...teachers.value], signal)
  return { composer, names }
})
const composer = computed(() => context.data.value?.composer)
const identity = computed(() => (withdrawn ? (signed.value ? 'signed' : 'anonymous') : (composer.value?.identity ?? 'choice')))
// The term list is the same for every term of the course. Keep the last one while the
// composer reloads for a newly chosen term, so the choices do not blink.
const offeredTerms = shallowRef<NonNullable<typeof composer.value>['terms']>([])
watch(composer, (value) => { if (value) offeredTerms.value = value.terms })
const termChoices = computed(() => {
  const rows = offeredTerms.value.map((item) => ({ value: item.id, label: item.name, marked: item.enrolled }))
  // A withdrawn review keeps its saved term even if it is no longer listed.
  return term.value && !rows.some((row) => row.value === term.value) ? [...rows, { value: term.value, label: context.data.value?.names.get(term.value)?.name ?? t('common.unknown'), marked: false }] : rows
})
const teacherChoices = computed(() => {
  const rows = (composer.value?.teachers ?? []).map((item) => ({ value: item.id, label: context.data.value?.names.get(item.id)?.name ?? t('common.unknown'), marked: item.enrolled }))
  const missing = withdrawn ? teachers.value.filter((id) => !rows.some((row) => row.value === id)) : []
  return [...rows, ...missing.map((id) => ({ value: id, label: context.data.value?.names.get(id)?.name ?? t('common.unknown'), marked: false }))]
})
const marksShown = computed(() => termChoices.value.some((item) => item.marked) || teacherChoices.value.some((item) => item.marked))

function input(): ReviewInput {
  return {
    kind: props.kind,
    target_id: props.targetId,
    title: props.kind === 'reply' ? '' : title.value,
    body: body.value,
    ratings: props.kind === 'course' ? ratings.value.slice() : [0, 0, 0, 0, 0],
    signed: signed.value,
    ...(disclosures.value.length ? { disclosures: disclosures.value.slice() } : {}),
    ...(props.kind === 'course' ? { term_id: term.value, teacher_ids: teachers.value.slice(), ...(grade.value ? { grade: grade.value } : {}) } : {}),
  }
}
const baseline = ref(JSON.stringify(input()))
const dirty = computed(() => JSON.stringify(input()) !== baseline.value)
const expired = computed(() => withdrawn && !!expires.value && Date.parse(expires.value) <= now.value)
const locked = computed(() => write.busy.value || write.uncertain.value || expired.value)
// 条件全部满足时不打扰作者。选择学期属于填写步骤，由下方的学期选项提示。
const showEligibility = computed(() => {
  if (!composer.value) return context.status.value === 'error'
  return (!composer.value.allowed && composer.value.state !== 'choose_term') || composer.value.requirements.some((item) => item.state !== 'satisfied')
})
// 课程评价发布时五个维度都要评分。草稿可以只填一部分。
const ratingsMissing = computed(() => props.kind === 'course' && ratings.value.some((level) => !level))
// Enrollment is no longer a disclosure: every course review carries its status automatically.
const disclosureOptions = computed(() => composer.value?.disclosures ?? [])
const missingConsent = computed(() => disclosureOptions.value.some(option => option.required && !disclosures.value.includes(option.key)))
const canPublish = computed(() => !missingConsent.value && !locked.value && composer.value?.allowed === true && !ratingsMissing.value && !gradeIncomplete.value && (props.kind !== 'course' || !!term.value) && bodyWritten.value && (props.kind === 'reply' || !!title.value.trim()))
// What the author still has to fill in before publishing, named next to the disabled button.
// Eligibility is decided by the server and explained in its own section above.
const missing = computed(() => {
  const items: string[] = []
  if (props.kind === 'course' && !term.value) items.push(t('academic.editor.term'))
  if (ratingsMissing.value) items.push(t('academic.editor.ratingsDone', { done: format.value.number(ratings.value.filter((level) => level > 0).length), total: format.value.number(ratings.value.length) }))
  if (gradeIncomplete.value) items.push(t('academic.grade.label'))
  if (props.kind !== 'reply' && !title.value.trim()) items.push(t('academic.editor.title'))
  if (!bodyWritten.value) items.push(t('academic.editor.body'))
  return items
})
const titleLimit = 200
const bodyLimit = 16000
// The counters sit beside the labels but are not part of them, so each field keeps its plain name.
const titleId = useId()
const bodyId = useId()
const counter = (value: string, limit: number) => `${format.value.number([...value].length)} / ${format.value.number(limit)}`
const remaining = computed(() => {
  if (!expires.value) return ''
  const minutes = Math.max(0, Math.ceil((Date.parse(expires.value) - now.value) / 60_000))
  return t('academic.editor.remaining', { hours: format.value.number(Math.floor(minutes / 60)), minutes: format.value.number(minutes % 60) })
})

// Server defaults are part of the initial form until the author changes it.
function applyDefaults(update: () => void) {
  const pristine = !dirty.value
  update()
  if (pristine) baseline.value = JSON.stringify(input())
}

watch(term, () => {
  if (!withdrawn && !restoring) teachers.value = []
  if (!textOnly.value && props.kind === 'course') void context.reload()
})
watch(() => props.parentId, () => {
  if (!textOnly.value && props.kind === 'reply') void context.reload()
})
watch(() => composer.value?.identity, (mode) => {
  if (!withdrawn && mode && mode !== 'choice') applyDefaults(() => { signed.value = mode === 'signed' })
})
// Required disclosures (for example a teacher replying on an own course) are always selected.
watch(disclosureOptions, (options) => {
  if (!composer.value) return
  const offered = new Set(options.map((option) => option.key))
  applyDefaults(() => {
    const defaults = composer.value?.teacher_reply ? [] : options.filter(option => option.required).map(option => option.key)
    disclosures.value = [...new Set([...disclosures.value.filter(key => offered.has(key)), ...defaults])]
  })
})

// Steps open in a new tab so the text being written stays here; returning rechecks.
const steps: Record<string, string> = { campus_eligibility: '/me/verification', identity_verified: '/me/account/identity' }
function recheck() {
  if (textOnly.value || document.visibilityState !== 'visible') return
  if (context.status.value !== 'loading' && !locked.value) void context.reload()
  if (schoolData.status.value !== 'loading') void schoolData.reload()
}
document.addEventListener('visibilitychange', recheck)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', recheck))

useLeaveGuard(() => (write.uncertain.value ? t('common.leaveUncertain') : dirty.value || write.busy.value ? t('common.leaveUnsaved') : ''), { query: props.leaveQuery })
watch(textOnly, only => {
  if (only) context.clear()
  else void context.reload()
}, { immediate: true })

async function submit(saveDraft: boolean) {
  if (locked.value || (!saveDraft && missingConsent.value)) return
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
  teachers.value = data.input.teacher_ids?.slice() ?? []
  grade.value = data.input.grade
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
              v-if="session.state.value !== 'member'"
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

    <!-- A course review has two parts: when and how it was (term, teacher, ratings) and what to say.
         On a wide form they sit side by side, so the text field is not stretched across the page. -->
    <fieldset
      class="editor-grid"
      :class="{ split: kind === 'course' }"
      :disabled="locked"
    >
      <div
        v-if="kind === 'course' && !textOnly"
        class="stack editor-side"
      >
        <p
          v-if="composer?.state === 'choose_term'"
          class="small muted"
        >
          {{ t('academic.composer.choose_term') }}
        </p>
        <ChoiceGroup
          v-model="term"
          :label="t('academic.editor.term')"
          :options="termChoices"
          :disabled="withdrawn"
          :limit="6"
          :more-label="t('academic.editor.moreTerms')"
          :mark-label="t('academic.editor.enrolledMark')"
        />
        <p
          v-if="context.status.value === 'ready' && !termChoices.length"
          class="small muted"
        >
          {{ t('academic.editor.noTerms') }}
        </p>
        <div
          v-if="term && teacherChoices.length"
          class="field"
        >
          <ChoiceGroup
            v-model="teachers"
            multiple
            :label="t('academic.editor.teacher')"
            :options="teacherChoices"
            :disabled="withdrawn"
            :mark-label="t('academic.editor.enrolledMark')"
          />
          <span class="field-hint">{{ t('academic.editor.teacherHint') }}</span>
        </div>
        <p
          v-if="marksShown"
          class="field-hint"
        >
          {{ t('academic.editor.enrolledLegend') }}
        </p>
        <p
          v-if="schoolData.data.value"
          class="enrollment-note"
          :class="schoolData.data.value.state === 'inactive' ? 'is-inactive' : 'is-active'"
        >
          <EnrollmentBadge
            v-if="schoolData.data.value.state === 'inactive'"
            status="unknown"
          />
          <ShieldCheck
            v-else
            class="enrollment-icon"
            aria-hidden="true"
          />
          <span>{{ enrollmentNote }}</span>
          <a
            v-if="schoolData.data.value.state !== 'active'"
            href="/me/verification/school-data"
            target="_blank"
          >{{ t(schoolData.data.value.state === 'historical' ? 'academic.editor.enrollmentReopen' : 'academic.editor.enrollmentSetup') }}</a>
        </p>
        <RatingInput
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
        <GradeInput
          v-model="grade"
          v-model:incomplete="gradeIncomplete"
          :disabled="locked"
        />
      </div>

      <div class="stack editor-main">
        <div
          v-if="kind !== 'reply'"
          class="field"
        >
          <div class="field-head">
            <label
              class="field-label"
              :for="titleId"
            >{{ t('academic.editor.title') }}</label>
            <span
              class="counter"
              aria-hidden="true"
            >{{ counter(title, titleLimit) }}</span>
          </div>
          <input
            :id="titleId"
            v-model="title"
            class="input"
            :maxlength="titleLimit"
            :placeholder="kind === 'course' ? t('academic.editor.titlePlaceholder') : undefined"
            required
          >
        </div>
        <div class="field">
          <div class="field-head">
            <label
              class="field-label"
              :for="bodyId"
            >{{ t('academic.editor.body') }}</label>
            <span
              class="counter"
              aria-hidden="true"
            >{{ counter(body, bodyLimit) }}</span>
          </div>
          <textarea
            :id="bodyId"
            v-model="body"
            class="textarea"
            :rows="kind === 'reply' ? 4 : 10"
            :maxlength="bodyLimit"
            required
          />
        </div>
        <p
          v-if="kind === 'mentor'"
          class="field-hint"
        >
          {{ t('academic.editor.templateHint') }}
        </p>
        <div
          v-else-if="kind === 'course'"
          class="field-hint stack-xs"
        >
          <p>{{ t('academic.editor.courseTemplateHint') }}</p>
          <p>{{ t('academic.editor.courseWritingTip') }}</p>
        </div>

        <label
          v-if="identity === 'choice'"
          class="check switch"
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
          v-if="disclosureOptions.length"
          class="stack-sm"
        >
          <legend>{{ t('academic.disclosure.title') }}</legend>
          <p class="field-hint">
            {{ t(composer?.teacher_reply ? 'academic.disclosure.teacherRequired' : 'academic.disclosure.hint') }}
          </p>
          <label
            v-for="option in disclosureOptions"
            :key="option.key"
            class="check"
          >
            <input
              v-model="disclosures"
              type="checkbox"
              :value="option.key"
              :disabled="option.required && !composer?.teacher_reply"
            >
            <span>{{ t(`academic.disclosure.labels.${option.key}`) }}<template v-if="option.key !== 'teacher'"> · {{ option.value }}</template></span>
          </label>
        </fieldset>
      </div>
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

    <p
      v-if="missing.length && !locked"
      class="field-hint missing"
      aria-live="polite"
    >
      {{ t('academic.editor.missing', { items: format.list(missing) }) }}
    </p>
    <div class="form-actions">
      <button
        class="btn btn-primary"
        type="submit"
        :disabled="!canPublish"
        :aria-busy="write.busy.value || undefined"
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
.enrollment-note { display: flex; flex-wrap: wrap; align-items: center; gap: .375rem .5rem; margin: 0; padding: .625rem .75rem; border-radius: var(--radius); background: var(--fill); color: var(--label-2); font-size: .875rem; }
.enrollment-note.is-active { background: var(--success-soft); color: var(--label); }
.enrollment-icon { flex: none; width: 18px; height: 18px; color: var(--success); }
.enrollment-note a { font-weight: 550; }
.editor { container-type: inline-size; box-shadow: var(--shadow-lift); animation: reveal .45s var(--ease-out); }
.editor-grid { display: grid; gap: 1rem; }
/* Without ratings beside it, the text column keeps a comfortable line length. */
.editor-grid:not(.split) .editor-main { max-width: var(--reading); }
@container (min-width: 58rem) {
  .editor-grid.split { grid-template-columns: minmax(0, 30rem) minmax(0, 1fr); gap: 2rem; }
  .editor-grid.split .editor-main { align-content: start; padding-inline-start: 2rem; border-inline-start: .5px solid var(--separator); }
  .editor-grid.split .editor-main .textarea { min-height: 19rem; }
}
.field-head { display: flex; align-items: baseline; justify-content: space-between; gap: .75rem; }
.counter { color: var(--label-3); font-size: .75rem; font-variant-numeric: tabular-nums; font-weight: 400; }
.missing { margin-block-end: -.375rem; }
.eligibility { display: grid; gap: .5rem; padding: .875rem 1rem; border-radius: var(--radius); background: var(--fill); }
</style>
