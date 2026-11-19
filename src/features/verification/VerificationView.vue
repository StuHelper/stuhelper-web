<script setup lang="ts">
import ActionError from './ActionError.vue'
import EmailCodeStep from './EmailCodeStep.vue'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { CircleCheck, Copy, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useLeaveGuard } from '../../shared/composables/leave'
import { useSession } from '../../shared/session'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { toast } from '../../shared/ui/toast'
import { safeNext, useAccess } from '../account/access'
import MeLayout from '../account/MeLayout.vue'
import { maskedIdentity, stages } from './api'
import CameraCapture from './CameraCapture.vue'
import MaterialThumb from './MaterialThumb.vue'
import MethodPicker from './MethodPicker.vue'
import SchoolPicker from './SchoolPicker.vue'
import VerificationRoles from './VerificationRoles.vue'
import VerificationStatus from './VerificationStatus.vue'
import { useVerificationFlow } from './flow'

// 学生认证和实名认证是两个页面，共用同一套流程。实名认证放在账号与安全下面。
// 学生认证页从上到下回答三件事：现在是什么状态、可以选哪种方式、下一步做什么。
const props = withDefaults(defineProps<{ scope?: 'student' | 'identity' }>(), { scope: 'student' })
const { t, te } = useI18n()
const format = useFormat()
const flow = useVerificationFlow()
const { form, removal } = flow
const session = useSession()
watch(() => session.state.value, state => { if (state === 'member') void flow.reload() }, { immediate: true })
useLeaveGuard(() => (flow.busy.value || Object.entries(form).some(([field, value]) => field !== 'material_type' && value) || flow.smsCode.value ? t('common.leaveUnsaved') : ''))
if (props.scope === 'identity') flow.selectMode('identity')
// 实名认证通过后不再需要表单。实名提交只更新状态，不产生认证申请，所以申请和学习经历只在学生认证页显示。
// 状态确认前不显示实名表单，否则已实名的用户会先看到待实名的页面。
const showIdentityForm = computed(() => props.scope === 'identity' && flow.summary.value?.identity_verified === false)
const methodDescription = computed(() => {
  const method = flow.mode.value === 'identity' ? 'real_name_identity_check' : flow.selectedMethod.value
  const configured = flow.school.value?.method_description_keys?.[method]
  if (configured?.startsWith('verification.methodDescriptions.') && te(configured)) return configured
  return method === 'real_name_identity_check' ? 'verification.methodDescriptions.real_name_identity_check' : ''
})
// Outbound school-email codes take over the card once the code has been requested.
const codeStep = computed(() => !!flow.email.value && flow.writable.value && flow.selectedMethod.value === 'student_email_outbound_otp' && flow.mode.value === 'student')
const masked = computed(() => (flow.summary.value?.identity_verified ? maskedIdentity(flow.summary.value) : undefined))

// The three steps of the student flow. An application exists from step two on; step three is
// whatever waits for something outside the form: the mail, the school's SMS, or a reviewer.
const step = flow.step
const stepNames = ['choose', 'fill', 'finish'] as const
// Someone already verified, or waiting for review, sees the outcome first and opens the steps on request.
const adding = ref(false)
const pickingSchool = ref(false)
const showSteps = computed(() => props.scope === 'student' && !!flow.summary.value && (adding.value || !!flow.active.value || !['verified', 'review'].includes(flow.standing.value)))
const activeCredential = computed(() => flow.credentials.value.find((row) => row.state === 'active'))
// While the person is working through the steps, the unfinished application is the one on screen; the status does not point at it again.
const shownStanding = computed(() => (flow.active.value && flow.standing.value === 'draft' ? 'none' : flow.standing.value))
const chosen = computed(() => [flow.school.value?.name, flow.asksKind.value && flow.chooseStudy.value ? t(`verification.kinds.${flow.kind.value}`) : '', t(`verification.methods.${flow.selectedMethod.value}`)].filter(Boolean).join(' · '))

// Each step starts at its heading, for the keyboard and for screen readers.
const stepsCard = ref<HTMLElement>()
async function copyInbound(address: string) {
  try {
    await navigator.clipboard.writeText(address)
    toast(t('verification.inboundAddressCopied'))
  } catch {
    toast(t('verification.inboundCopyFailed'))
  }
}
// Scrolling follows the reduced-motion setting; an explicit smooth scroll would ignore the CSS rule.
const scrolling = (): ScrollBehavior => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')
const stepTitle = ref<HTMLElement>()
watch(step, async (now, before) => {
  if (now === before) return
  await nextTick()
  stepTitle.value?.focus({ preventScroll: true })
  stepsCard.value?.scrollIntoView({ block: 'nearest', behavior: scrolling() })
})
async function openSteps() {
  adding.value = true
  await nextTick()
  stepsCard.value?.scrollIntoView({ block: 'start', behavior: scrolling() })
  stepTitle.value?.focus({ preventScroll: true })
}
function closeSteps() {
  flow.backToMethod()
  adding.value = false
}
function resumeStanding() {
  const application = flow.standingApplication.value
  if (application && flow.isStudentApplication(application)) void flow.resume(application)
}
watch(() => flow.standing.value, (now, before) => { if (now === 'verified' && before !== 'verified') adding.value = false })

// Back to the page that required verification, once and only on a real change.
const route = useRoute()
const router = useRouter()
const access = useAccess()
const next = computed(() => safeNext(route.query.next))
let eligible: boolean | undefined
watch(flow.summary, (value) => {
  if (!value) return
  void access.refresh()
  if (eligible === false && value.campus_eligibility && next.value) void router.replace(next.value)
  eligible = value.campus_eligibility
})

// Option labels come from provider-defined codes; an unknown code shows as-is
// only where the provider documents it as a display value (material types).
function label(prefix: string, code: string, fallback = '') {
  const key = `${prefix}.${code}`
  return te(key) ? t(key) : fallback || t('common.unknown')
}

function profileValue(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return t('common.notProvided')
  if (field === 'identity_valid_until' && typeof value === 'string' && Number.isFinite(Date.parse(value))) return format.value.dateTime(value)
  return typeof value === 'string' ? value : JSON.stringify(value)
}
// The card lists exactly the fields the server projected, student number, name and college first.
const leading = ['student_id', 'name', 'college_name', 'department']
const profileRows = computed(() => Object.entries(flow.profile.value?.fields ?? {}).sort(([a], [b]) => (leading.indexOf(a) + 1 || 99) - (leading.indexOf(b) + 1 || 99)))
const credentialLine = (credential: { kind: string; stage: string; student_display: string }) => [credential.kind === 'unknown' ? '' : label('verification.kinds', credential.kind), credential.stage === 'unknown' ? '' : label('verification.stages', credential.stage), credential.student_display].filter(Boolean).join(' · ')
</script>

<template>
  <MeLayout
    :title="t(scope === 'identity' ? 'verification.identityTitle' : 'verification.unified.title')"
    :description="t(scope === 'identity' ? 'verification.identityDescription' : 'verification.description')"
    :back="scope === 'identity' ? '/me/account' : undefined"
    :back-label="scope === 'identity' ? t('me.security') : undefined"
  >
    <template #actions>
      <button
        class="btn btn-sm btn-ghost"
        type="button"
        :disabled="flow.loading.value || flow.busy.value"
        :aria-busy="flow.loading.value || undefined"
        @click="flow.reload"
      >
        <RefreshCw aria-hidden="true" />{{ t('common.refresh') }}
      </button>
    </template>
    <VerificationRoles
      v-if="scope === 'student'"
      role="student"
    />

    <div class="stack-lg">
      <div
        v-if="next && flow.summary.value?.campus_eligibility"
        class="notice notice-success"
        role="status"
      >
        <span>{{ t('verification.continueReady') }}</span>
        <RouterLink
          class="btn btn-sm"
          :to="next"
        >
          {{ t('verification.continueNext') }}
        </RouterLink>
      </div>
      <p
        v-else-if="next"
        class="notice notice-info"
      >
        {{ t('verification.returnHint') }}
      </p>
      <ErrorNotice
        v-if="flow.loadError.value"
        :code="flow.loadError.value"
        @retry="flow.reload"
      />
      <p
        v-if="flow.notice.value"
        class="notice notice-success"
        role="status"
      >
        <CircleCheck
          class="notice-icon"
          aria-hidden="true"
        /><span>{{ t(`verification.notice.${flow.notice.value}`) }}</span>
      </p>

      <!-- 1. Where the person stands, and the one action that follows from it. -->
      <VerificationStatus
        v-if="scope === 'student' && (flow.summary.value || flow.loading.value)"
        :standing="shownStanding"
        :credential="activeCredential"
        :application="shownStanding === flow.standing.value ? flow.standingApplication.value : undefined"
        :school="flow.schoolName((flow.standing.value === 'verified' ? activeCredential?.school_id : flow.standingApplication.value?.school_id) ?? '')"
        :busy="flow.busy.value"
        :reminder="flow.summary.value?.next_evaluation_at ? t('verification.newcomerReminder', { time: format.dateTime(flow.summary.value.next_evaluation_at) }) : ''"
        @resume="resumeStanding"
        @profile="activeCredential && flow.showProfile(activeCredential.id)"
        @start="openSteps"
        @refresh="flow.reload"
      />
      <section
        v-else-if="scope === 'identity'"
        class="card stack-sm identity-card"
        :aria-label="t('verification.statusTitle')"
        :aria-busy="flow.loading.value"
      >
        <h2 class="small muted">
          {{ t('verification.identity') }}
        </h2>
        <StatusTag
          v-if="flow.summary.value"
          :tone="flow.summary.value.identity_verified ? 'success' : 'neutral'"
        >
          {{ t(flow.summary.value.identity_verified ? 'verification.identityVerified' : 'verification.identityMissing') }}
        </StatusTag>
        <span
          v-else
          class="skeleton-tag"
          aria-hidden="true"
        />
        <dl
          v-if="masked"
          class="identity-facts"
        >
          <div>
            <dt>{{ t('verification.identityName') }}</dt>
            <dd>{{ masked.name }}</dd>
          </div>
          <div>
            <dt>{{ t('verification.identityNumber') }}</dt>
            <dd>{{ masked.number }}</dd>
          </div>
        </dl>
      </section>

      <!-- 2. The steps: choose, fill in, finish. -->
      <section
        v-if="showSteps"
        ref="stepsCard"
        class="card steps-card"
        aria-labelledby="verification-step-title"
      >
        <ol
          class="steps"
          :aria-label="t('verification.steps.label')"
        >
          <li
            v-for="(name, index) in stepNames"
            :key="name"
            :class="{ done: index + 1 < step, current: index + 1 === step }"
            :aria-current="index + 1 === step ? 'step' : undefined"
          >
            <span
              class="step-dot"
              aria-hidden="true"
            >{{ index + 1 < step ? '' : format.number(index + 1) }}</span><span class="step-name">{{ t(`verification.steps.${name}`) }}</span>
          </li>
        </ol>
        <h2
          id="verification-step-title"
          ref="stepTitle"
          class="step-title"
          tabindex="-1"
        >
          {{ t(step === 1 ? 'verification.start' : codeStep ? 'verification.emailStep.title' : `verification.steps.${stepNames[step - 1]}`) }}
        </h2>

        <p
          v-if="!flow.schools.value.length && !flow.loading.value"
          key="none"
          class="empty"
        >
          {{ t('verification.noSchools') }}
        </p>

        <form
          v-else-if="step === 1"
          key="choose"
          class="stack step-body"
          @submit.prevent="flow.start()"
        >
          <!-- One school needs no search box; the picker opens on request. -->
          <div
            v-if="flow.school.value && !pickingSchool"
            class="school-line"
          >
            <span class="field-label">{{ t('verification.school') }}</span>
            <b>{{ flow.school.value.name }}</b>
            <button
              class="btn btn-sm btn-ghost"
              type="button"
              :disabled="flow.busy.value"
              @click="pickingSchool = true"
            >
              {{ t('verification.changeSchool') }}
            </button>
          </div>
          <SchoolPicker
            v-else
            :model-value="flow.selectedSchool.value"
            :schools="flow.schools.value"
            :disabled="flow.busy.value"
            @select="(school) => { flow.selectSchool(school); pickingSchool = false }"
          />
          <MethodPicker
            :kinds="flow.kindChoices.value"
            :kind="flow.kind.value"
            :methods="flow.availableMethods.value"
            :method="flow.selectedMethod.value"
            :allowed="flow.methodAllowed"
            :disabled="flow.busy.value"
            @kind="flow.chooseKind"
            @method="flow.chooseMethod"
          />
          <label
            v-if="flow.chooseStage.value"
            class="field stage-field"
          >
            <span class="field-label">{{ t('verification.stage') }}</span>
            <AppSelect
              v-model="flow.stage.value"
              :body-lock="false"
              class="select"
              :disabled="flow.busy.value"
            >
              <option
                v-for="item in stages"
                :key="item"
                :value="item"
              >{{ t(`verification.stages.${item}`) }}</option>
            </AppSelect>
          </label>
          <div class="terms">
            <p
              v-if="methodDescription"
              class="small"
            >
              {{ t(methodDescription) }}
            </p>
            <p
              v-if="flow.school.value?.profile_schema === 'bit.v1' && flow.selectedMethod.value === 'school_sso'"
              class="small"
            >
              {{ t('verification.bitPrivacy') }}
            </p>
            <p class="small muted">
              {{ t('verification.privacy') }}
            </p>
            <label class="check">
              <input
                v-model="flow.consent.value"
                type="checkbox"
                :disabled="flow.busy.value"
                required
              >
              <span>{{ t('verification.consent') }}</span>
            </label>
          </div>
          <ActionError :code="flow.errorTarget.value === 'form' ? flow.error.value : ''" />
          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              :disabled="flow.busy.value || !flow.school.value || !flow.consent.value || !flow.availableMethods.value.length || !flow.methodAllowed(flow.selectedMethod.value)"
              :aria-busy="flow.busy.value || undefined"
            >
              {{ t('verification.continue') }}
            </button>
            <button
              v-if="adding && ['verified', 'review'].includes(flow.standing.value)"
              class="btn btn-ghost"
              type="button"
              :disabled="flow.busy.value"
              @click="closeSteps"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </form>

        <form
          v-else-if="step === 2"
          key="fill"
          class="stack step-body verification-form"
          @submit.prevent="flow.submit()"
        >
          <p class="chosen">
            {{ chosen }}
          </p>
          <!-- A school login that failed, was cancelled or expired leaves the application open for another try. -->
          <p
            v-if="flow.active.value?.school_challenge && ['failed', 'cancelled', 'expired'].includes(flow.active.value.school_challenge.state)"
            class="notice notice-warning stack-sm"
            role="status"
          >
            <span>{{ label('verification.schoolStates', flow.active.value.school_challenge.state) }}</span>
            <span v-if="flow.active.value.school_challenge.code">{{ label('verification.schoolErrors', flow.active.value.school_challenge.code) }}</span>
          </p>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">{{ t('verification.studentId') }}</span>
              <input
                v-model.trim="form.student_id"
                class="input"
                autocomplete="off"
                maxlength="64"
                required
                :disabled="flow.busy.value"
              >
            </label>
            <label
              v-if="flow.selectedMethod.value !== 'school_sso'"
              class="field"
            >
              <span class="field-label">{{ t('verification.name') }}</span>
              <input
                v-model.trim="form.name"
                class="input"
                autocomplete="name"
                maxlength="100"
                required
                :disabled="flow.busy.value"
              >
            </label>
            <label
              v-if="flow.selectedMethod.value === 'real_name_identity_check'"
              class="field"
            >
              <span class="field-label">{{ t('verification.document') }}</span>
              <input
                v-model.trim="form.document_number"
                class="input"
                autocomplete="off"
                maxlength="32"
                required
                :disabled="flow.busy.value"
              >
            </label>
            <label
              v-if="flow.selectedMethod.value === 'school_sso'"
              class="field"
            >
              <span class="field-label">{{ t('verification.password') }}</span>
              <input
                v-model="form.password"
                class="input"
                type="password"
                autocomplete="off"
                maxlength="256"
                required
                :disabled="flow.busy.value"
              >
            </label>
            <template v-if="flow.manual.value">
              <label class="field">
                <span class="field-label">{{ t('verification.department') }}</span>
                <input
                  v-model.trim="form.department"
                  class="input"
                  maxlength="100"
                  required
                  :disabled="flow.busy.value"
                >
              </label>
              <label class="field">
                <span class="field-label">{{ t('verification.contactEmail') }}</span>
                <input
                  v-model.trim="form.email"
                  class="input"
                  type="email"
                  maxlength="254"
                  required
                  :disabled="flow.busy.value"
                >
              </label>
              <label class="field">
                <span class="field-label">{{ t('verification.materialType') }}</span>
                <AppSelect
                  v-model="form.material_type"
                  :body-lock="false"
                  class="select"
                  required
                  :disabled="flow.busy.value"
                >
                  <option
                    v-for="type in flow.school.value?.material_types"
                    :key="type"
                    :value="type"
                  >{{ label('verification.materialTypes', type, type) }}</option>
                </AppSelect>
              </label>
            </template>
          </div>
          <p
            v-if="methodDescription"
            class="small muted"
          >
            {{ t(methodDescription) }}
          </p>

          <div
            v-if="flow.manual.value && flow.active.value"
            class="stack-sm"
          >
            <CameraCapture
              :key="flow.active.value.id"
              :application-id="flow.active.value.id"
              :existing-ids="flow.materials.value.map((item) => item.id)"
              @captured="flow.captured"
            />
            <p class="small">
              {{ t('verification.materials', { count: format.number(flow.materials.value.length) }) }}
            </p>
            <ul class="list-plain">
              <li
                v-for="(material, index) in flow.materials.value"
                :key="material.id"
                class="row"
              >
                <MaterialThumb
                  :material="material"
                  :alt="t('verification.photo', { index: format.number(index + 1) })"
                />
                <span>{{ t('verification.photo', { index: format.number(index + 1) }) }}</span>
                <button
                  class="btn btn-sm btn-ghost"
                  type="button"
                  :disabled="flow.busy.value"
                  @click="flow.removeMaterial(material.id)"
                >
                  {{ t('common.remove') }}
                </button>
              </li>
            </ul>
          </div>

          <ActionError :code="flow.errorTarget.value === 'form' ? flow.error.value : ''" />
          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              :disabled="flow.busy.value || (flow.manual.value && !flow.materials.value.length)"
              :aria-busy="flow.busy.value || undefined"
            >
              {{ t(flow.emailMethod.value ? 'verification.createChallenge' : 'verification.submit') }}
            </button>
            <button
              class="btn btn-ghost"
              type="button"
              :disabled="flow.busy.value"
              @click="flow.backToMethod"
            >
              {{ t('verification.back') }}
            </button>
          </div>
        </form>

        <div
          v-else
          key="finish"
          class="stack step-body"
        >
          <EmailCodeStep
            v-if="codeStep && flow.email.value"
            v-model:code="form.code"
            :challenge="flow.email.value"
            :sent-at="flow.emailSentAt.value"
            :busy="flow.busy.value"
            :error="flow.errorTarget.value === 'email' || flow.errorTarget.value === 'form' ? flow.error.value : ''"
            @confirm="flow.confirmEmail"
            @resend="flow.resendEmail"
            @back="flow.backToMethod"
          />
          <section
            v-if="flow.active.value?.school_challenge"
            class="notice notice-info stack"
            aria-live="polite"
          >
            <div class="stack-sm">
              <h3>{{ t('verification.schoolProgress') }}</h3>
              <p>{{ label('verification.schoolStates', flow.active.value.school_challenge.state) }}</p>
              <p v-if="flow.active.value.school_challenge.code">
                {{ label('verification.schoolErrors', flow.active.value.school_challenge.code) }}
              </p>
              <p class="subtle">
                {{ t('verification.expiresAt', { time: format.dateTime(flow.active.value.school_challenge.expires_at) }) }}
              </p>
            </div>
            <ActionError :code="flow.errorTarget.value === 'school' ? flow.error.value : ''" />
            <form
              v-if="flow.active.value.school_challenge.state === 'waiting_sms'"
              class="stack-sm"
              @submit.prevent="flow.continueSchool('submit_sms')"
            >
              <p class="small">
                {{ t('verification.schoolSmsHelp', { phone: flow.active.value.school_challenge.masked_phone }) }}
              </p>
              <div class="row">
                <label class="field">
                  <span class="field-label">{{ t('verification.schoolSms') }}</span>
                  <input
                    v-model="flow.smsCode.value"
                    class="input"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    pattern="[0-9]{4,8}"
                    maxlength="8"
                    required
                    :disabled="flow.busy.value"
                  >
                </label>
                <button
                  class="btn btn-primary"
                  :disabled="flow.busy.value"
                >
                  {{ t('common.confirm') }}
                </button>
              </div>
            </form>
            <button
              v-if="flow.schoolPending.value"
              class="btn btn-sm"
              type="button"
              :disabled="flow.busy.value"
              @click="flow.continueSchool('cancel')"
            >
              {{ t('verification.cancelSchool') }}
            </button>
          </section>
          <template v-if="flow.active.value && !codeStep">
            <div
              class="notice"
              role="status"
            >
              <span>{{ t('verification.applicationState', { state: label('verification.states', flow.active.value.state) }) }}</span>
              <span
                v-if="flow.active.value.review_note"
                class="small"
              >{{ flow.active.value.review_note }}</span>
              <span
                v-if="flow.active.value.qualification_expires_at"
                class="subtle"
              >{{ t('verification.expiresAt', { time: format.dateTime(flow.active.value.qualification_expires_at) }) }}</span>
            </div>
            <ActionError :code="flow.errorTarget.value === 'form' ? flow.error.value : ''" />
            <div class="form-actions">
              <button
                class="btn"
                type="button"
                :disabled="flow.busy.value"
                @click="flow.refreshApplication"
              >
                {{ t('verification.refreshStatus') }}
              </button>
              <button
                v-if="!flow.schoolPending.value"
                class="btn btn-ghost"
                type="button"
                :disabled="flow.busy.value"
                @click="closeSteps"
              >
                {{ t('common.close') }}
              </button>
            </div>
          </template>
          <section
            v-if="flow.email.value && flow.writable.value && flow.selectedMethod.value === 'student_email_inbound_challenge'"
            class="notice notice-info stack"
          >
            <p>{{ flow.email.value.masked_email }} · {{ label('verification.states', flow.email.value.state) }}</p>
            <p class="subtle">
              {{ t('verification.expiresAt', { time: format.dateTime(flow.email.value.expires_at) }) }}
            </p>
            <p class="small">
              {{ t('verification.inboundHelp') }}
            </p>
            <div class="row">
              <code class="mono">{{ flow.email.value.target_address }}</code>
              <button
                class="btn btn-sm"
                type="button"
                @click="copyInbound(flow.email.value.target_address)"
              >
                <Copy aria-hidden="true" />{{ t('verification.copyInboundAddress') }}
              </button>
            </div>
          </section>
        </div>
      </section>
      <button
        v-else-if="scope === 'student' && flow.summary.value"
        class="btn another"
        type="button"
        @click="openSteps"
      >
        {{ t('verification.status.startAnother') }}
      </button>

      <!-- Real-name verification keeps its single form. -->
      <section
        v-if="showIdentityForm"
        class="card stack"
      >
        <h2>{{ t('verification.start') }}</h2>
        <p
          v-if="!flow.schools.value.length && !flow.loading.value"
          class="empty"
        >
          {{ t('verification.noSchools') }}
        </p>
        <form
          v-else
          class="stack verification-form"
          @submit.prevent="flow.submit()"
        >
          <SchoolPicker
            :model-value="flow.selectedSchool.value"
            :schools="flow.schools.value"
            :disabled="flow.busy.value"
            @select="flow.selectSchool"
          />
          <p
            v-if="!flow.availableMethods.value.includes('real_name_identity_check')"
            class="notice notice-warning small"
          >
            {{ t('errors.method_unavailable') }}
          </p>
          <p
            v-if="methodDescription"
            class="small muted"
          >
            {{ t(methodDescription) }}
          </p>
          <p class="small muted">
            {{ t('verification.privacy') }}
          </p>
          <label class="check">
            <input
              v-model="flow.consent.value"
              type="checkbox"
              :disabled="flow.busy.value"
              required
            >
            <span>{{ t('verification.consent') }}</span>
          </label>
          <div class="form-grid">
            <label class="field">
              <span class="field-label">{{ t('verification.studentId') }}</span>
              <input
                v-model.trim="form.student_id"
                class="input"
                autocomplete="off"
                maxlength="64"
                required
                :disabled="flow.busy.value"
              >
            </label>
            <label class="field">
              <span class="field-label">{{ t('verification.name') }}</span>
              <input
                v-model.trim="form.name"
                class="input"
                autocomplete="name"
                maxlength="100"
                required
                :disabled="flow.busy.value"
              >
            </label>
            <label class="field">
              <span class="field-label">{{ t('verification.document') }}</span>
              <input
                v-model.trim="form.document_number"
                class="input"
                autocomplete="off"
                maxlength="32"
                required
                :disabled="flow.busy.value"
              >
            </label>
          </div>
          <ActionError :code="flow.errorTarget.value === 'form' ? flow.error.value : ''" />
          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              :disabled="flow.busy.value || !flow.school.value || !flow.consent.value || !flow.availableMethods.value.includes('real_name_identity_check')"
              :aria-busy="flow.busy.value || undefined"
            >
              {{ t('verification.submit') }}
            </button>
          </div>
        </form>
      </section>
      <!-- 3. Records: what has been verified, and what was asked for. Empty lists are left out. -->
      <section
        v-if="scope === 'student' && flow.credentials.value.length"
        class="section"
        aria-labelledby="verification-experiences"
      >
        <div class="section-head">
          <h2
            id="verification-experiences"
            class="d-title"
          >
            {{ t('verification.experiences') }}
          </h2>
        </div>
        <p class="small muted">
          {{ t('verification.validityHelp') }}
        </p>
        <ul class="list">
          <li
            v-for="credential in flow.credentials.value"
            :key="credential.id"
            class="card stack-sm"
          >
            <div class="row-between">
              <h3>{{ flow.schoolName(credential.school_id) || t('common.unknown') }}</h3>
              <StatusTag :tone="credential.state === 'active' ? 'success' : 'neutral'">
                {{ label('verification.states', credential.state) }}
              </StatusTag>
            </div>
            <p class="small">
              {{ credentialLine(credential) }}
            </p>
            <p class="subtle">
              {{ credential.expires_at ? t('verification.expiresAt', { time: format.dateTime(credential.expires_at) }) : t('verification.permanent') }}
            </p>
            <div
              v-if="credential.state !== 'deleted'"
              class="row"
            >
              <button
                class="btn btn-sm"
                type="button"
                :disabled="flow.busy.value"
                @click="flow.showProfile(credential.id)"
              >
                {{ t('verification.viewProfile') }}
              </button>
              <button
                v-if="credential.state === 'active'"
                class="btn btn-sm btn-ghost"
                type="button"
                @click="removal.id = credential.id; removal.kind = 'revoke'"
              >
                {{ t('verification.requestRevoke') }}
              </button>
              <button
                class="btn btn-sm btn-ghost"
                type="button"
                @click="removal.id = credential.id; removal.kind = 'delete'"
              >
                {{ t('verification.requestDelete') }}
              </button>
            </div>
            <form
              v-if="removal.id === credential.id"
              class="stack-sm"
              @submit.prevent="flow.requestRemoval"
            >
              <p class="small muted">
                {{ t('verification.removalHelp') }}
              </p>
              <label class="field">
                <span class="field-label">{{ t(removal.kind === 'revoke' ? 'verification.revokeReason' : 'verification.deleteReason') }}</span>
                <textarea
                  v-model.trim="removal.reason"
                  class="textarea"
                  maxlength="500"
                  required
                />
              </label>
              <ActionError :code="flow.errorTarget.value === 'removal' ? flow.error.value : ''" />
              <div class="row">
                <button
                  class="btn btn-sm btn-primary"
                  :disabled="flow.busy.value"
                >
                  {{ t('common.submit') }}
                </button>
                <button
                  class="btn btn-sm"
                  type="button"
                  @click="removal.id = ''"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </form>
            <!-- A failed profile request is reported under the credential it was asked for, and nowhere else. -->
            <ActionError :code="flow.errorTarget.value === 'profile' && flow.profileRequestId.value === credential.id ? flow.error.value : ''" />
            <!-- The school profile opens under the credential it belongs to. -->
            <section
              v-if="flow.profile.value && flow.profileCredential.value?.id === credential.id"
              class="profile"
              :aria-labelledby="`verification-profile-${credential.id}`"
            >
              <div class="row-between">
                <h3
                  :id="`verification-profile-${credential.id}`"
                  class="d-title"
                >
                  {{ t('verification.profileTitle') }}
                </h3>
                <button
                  class="btn btn-sm btn-ghost"
                  type="button"
                  @click="flow.profile.value = undefined"
                >
                  {{ t('common.close') }}
                </button>
              </div>
              <p
                v-if="flow.profile.value.data_status === 'unavailable' || !profileRows.length"
                class="small"
              >
                {{ t('verification.profileStatus.unavailable') }}
              </p>
              <dl class="facts">
                <div
                  v-for="[field, value] in profileRows"
                  :key="field"
                  :data-profile-field="field"
                >
                  <dt>
                    {{ label('verification.profileFields', field) }}
                  </dt>
                  <dd>{{ profileValue(value, field) }}</dd>
                </div>
              </dl>
              <p class="subtle">
                <time :datetime="credential.verified_at">{{ t('verification.verifiedAt', { time: format.dateTime(credential.verified_at) }) }}</time>
              </p>
            </section>
          </li>
        </ul>
        <ActionError :code="flow.errorTarget.value === 'credentials' ? flow.error.value : ''" />
        <button
          v-if="flow.cursors.credentials"
          class="btn"
          type="button"
          :disabled="flow.busy.value"
          @click="flow.loadMore('credentials')"
        >
          {{ t('common.loadMore') }}
        </button>
      </section>

      <section
        v-if="scope === 'student' && flow.applications.value.length"
        class="section"
        aria-labelledby="verification-applications"
      >
        <h2
          id="verification-applications"
          class="d-title"
        >
          {{ t('verification.applications') }}
        </h2>
        <ul class="list applications">
          <li
            v-for="application in flow.applications.value"
            :key="application.id"
            class="card row-between"
          >
            <div class="stack-sm">
              <span class="row"><strong>{{ flow.schoolName(application.school_id) || t('common.unknown') }}</strong><StatusTag :tone="application.state === 'approved' ? 'success' : application.state === 'rejected' ? 'danger' : ['pending_review', 'supplement_required'].includes(application.state) ? 'warning' : 'neutral'">{{ label('verification.states', application.state) }}</StatusTag></span>
              <span class="small">{{ t(`verification.methods.${application.method}`) }}</span>
              <span
                v-if="application.review_note"
                class="small muted"
              >{{ application.review_note }}</span>
              <span class="subtle">{{ format.dateTime(application.updated_at) }}</span>
            </div>
            <button
              v-if="flow.isStudentApplication(application) && ['in_progress', 'supplement_required'].includes(application.state) && flow.active.value?.id !== application.id"
              class="btn btn-sm"
              type="button"
              :disabled="flow.busy.value"
              @click="flow.isStudentApplication(application) && flow.resume(application)"
            >
              {{ t('verification.continue') }}
            </button>
          </li>
        </ul>
        <ActionError :code="flow.errorTarget.value === 'applications' ? flow.error.value : ''" />
        <button
          v-if="flow.cursors.applications"
          class="btn"
          type="button"
          :disabled="flow.busy.value"
          @click="flow.loadMore('applications')"
        >
          {{ t('common.loadMore') }}
        </button>
      </section>

      <section
        v-if="scope === 'student' && flow.requests.value.length"
        class="section"
        aria-labelledby="verification-requests"
      >
        <h2
          id="verification-requests"
          class="d-title"
        >
          {{ t('verification.requests') }}
        </h2>
        <ul class="list">
          <li
            v-for="request in flow.requests.value"
            :key="request.id"
            class="card stack-sm"
          >
            <div class="row-between">
              <strong>{{ flow.schoolName(request.school_id) || t('common.unknown') }} · {{ t(request.kind === 'revoke' ? 'verification.requestRevoke' : 'verification.requestDelete') }}</strong>
              <StatusTag :tone="request.state === 'approved' ? 'success' : request.state === 'rejected' ? 'danger' : 'warning'">
                {{ label('verification.states', request.state) }}
              </StatusTag>
            </div>
            <p class="small">
              {{ request.reason }}
            </p>
            <p
              v-if="request.note"
              class="small notice notice-info"
            >
              {{ request.note }}
            </p>
          </li>
        </ul>
        <ActionError :code="flow.errorTarget.value === 'requests' ? flow.error.value : ''" />
        <button
          v-if="flow.cursors.requests"
          class="btn"
          type="button"
          :disabled="flow.busy.value"
          @click="flow.loadMore('requests')"
        >
          {{ t('common.loadMore') }}
        </button>
      </section>
    </div>
  </MeLayout>
</template>

<style scoped>
.notice-icon { flex: none; width: 1.125rem; height: 1.125rem; }
.notice:has(> .notice-icon) { justify-content: flex-start; }
.steps-card { display: grid; gap: 1rem; padding: clamp(1.125rem, 2vw, 1.5rem); scroll-margin-block-start: calc(var(--nav-height) + 1rem); }
/* Three numbered steps on one line; the current one is filled, finished ones carry a tick. */
.steps { display: flex; align-items: center; gap: .5rem; min-width: 0; color: var(--label-3); font-size: .8125rem; }
.steps li { display: flex; align-items: center; gap: .375rem; min-width: 0; }
.steps li + li::before { content: ""; flex: none; width: clamp(.75rem, 4vw, 2.5rem); height: 1.5px; margin-inline-end: .125rem; border-radius: 1px; background: var(--fill-strong); transition: background-color .3s; }
.steps li.done + li::before, .steps li.current::before { background: var(--accent-fill); }
.step-dot { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: var(--fill); color: var(--label-2); font-size: .75rem; font-weight: 650; font-variant-numeric: tabular-nums; transition: background-color .3s, color .3s; }
.steps .current { color: var(--label); font-weight: 600; }
.steps .current .step-dot { background: var(--accent-fill); color: var(--on-accent); }
.steps .done .step-dot { background: var(--accent-soft) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14' fill='none' stroke='%232d5bff' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 7.5 2.8 2.8L11 4.5'/%3E%3C/svg%3E") center / 13px no-repeat; }
.step-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-title { font-size: clamp(1.25rem, 1.1rem + .6vw, 1.5rem); }
.step-title:focus { outline: none; }
/* Each step fades in as it replaces the previous one. A CSS animation needs no script timing, so it also plays in tests that control the clock. */
.step-body { gap: 1.125rem; animation: step-in .26s var(--ease-out); }
@keyframes step-in { from { opacity: 0; transform: translateY(8px); } }
.school-line { display: flex; flex-wrap: wrap; align-items: center; gap: .375rem .75rem; }
.school-line b { font-weight: 600; }
.stage-field { max-width: 16rem; }
/* What is being agreed to sits in one quiet block right above the agreement itself. */
.terms { display: grid; gap: .5rem; padding: .875rem 1rem; border-radius: var(--radius); background: var(--fill); }
.terms .check { margin-block-start: .25rem; font-weight: 500; }
.chosen { justify-self: start; padding: .25rem .75rem; border-radius: var(--pill); background: var(--accent-soft); color: var(--accent); font-size: .875rem; font-weight: 550; overflow-wrap: anywhere; }
.another { justify-self: start; }
.profile { display: grid; gap: .75rem; margin-block-start: .25rem; padding: 1rem; border-radius: var(--radius); background: var(--fill); animation: panel-in .2s var(--ease-out); }
.profile .facts { grid-template-columns: repeat(auto-fill, minmax(min(100%, 9rem), 1fr)); }
.applications .card { padding-block: .875rem; }
@media (max-width: 640px) {
  .step-name { display: none; }
  .steps .current .step-name { display: inline; }
  .form-actions .btn { flex: 1 1 auto; }
}
</style>
