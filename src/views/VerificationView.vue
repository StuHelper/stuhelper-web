<script setup lang="ts">
import '../verification.css'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import CameraCapture from '../components/CameraCapture.vue'
import { verification, VerificationError, kinds, stages, type Schemas } from '../api/verification'

const { t, d, n } = useI18n()
const controller = new AbortController()
const loading = ref(false), busy = ref(false), error = ref(''), notice = ref('')
const schools = ref<Schemas['School'][]>([]), applications = ref<Schemas['Application'][]>([]), credentials = ref<Schemas['Credential'][]>([]), requests = ref<Schemas['RemovalRequest'][]>([])
const summary = ref<Schemas['Summary']>()
const profile = ref<Schemas['StudentProfile']>()
const smsCode = ref('')
let schoolTimer: ReturnType<typeof setTimeout> | undefined
let schoolPollCount = 0
let schoolPollId = ''
const hasMore = reactive({ schools: false, applications: false, credentials: false, requests: false })
const mode = ref<'student' | 'identity'>('student')
const selectedSchool = ref(''), selectedMethod = ref<Schemas['Method']>('manual_material_review')
const stage = ref<Schemas['Stage']>('bachelor'), kind = ref<Schemas['Kind']>('student'), consent = ref(false)
const active = ref<Schemas['Application']>(), email = ref<Schemas['EmailChallenge']>(), materials = ref<Schemas['Material'][]>([])
const form = reactive({ student_id: '', name: '', document_number: '', password: '', department: '', email: '', material_type: '', code: '' })
const removal = reactive({ id: '', kind: 'revoke' as 'revoke' | 'delete', reason: '' })
const suggestion = reactive({ name: '', website: '' })
const school = computed(() => schools.value.find(s => s.id === selectedSchool.value))
const availableMethods = computed(() => school.value?.methods ?? [])
const manual = computed(() => selectedMethod.value === 'manual_material_review')
const emailMethod = computed(() => selectedMethod.value === 'student_email_outbound_otp' || selectedMethod.value === 'student_email_inbound_challenge')
const schoolPending = computed(() => !!active.value?.school_challenge && ['processing', 'waiting_sms'].includes(active.value.school_challenge.state))
const chooseStudy = computed(() => manual.value || school.value?.profile_schema === 'buaa.imported.v1' || !school.value?.profile_schema)
const writable = computed(() => active.value && ['in_progress', 'supplement_required'].includes(active.value.state) && !schoolPending.value)
function failure(e: unknown) { error.value = e instanceof VerificationError ? e.code : 'network' }
async function reload() {
  loading.value = true; error.value = ''; profile.value = undefined
  try {
    const [s, a, c, r, state] = await Promise.all([
      verification.list('School', '/api/v1/verification/schools?limit=100', controller.signal),
      verification.list('Application', '/api/v1/verification/applications?limit=25', controller.signal),
      verification.list('Credential', '/api/v1/verification/credentials?limit=25', controller.signal),
      verification.list('RemovalRequest', '/api/v1/verification/requests?limit=25', controller.signal),
      verification.get('Summary', '/api/v1/verification/summary', controller.signal),
    ])
    schools.value = s; applications.value = a; credentials.value = c; requests.value = r; summary.value = state
    hasMore.schools = s.length === 100; hasMore.applications = a.length === 25; hasMore.credentials = c.length === 25; hasMore.requests = r.length === 25
    if (!selectedSchool.value && s[0]) { selectedSchool.value = s[0].id; selectSchool() }
  } catch (e) { if (!controller.signal.aborted) failure(e) } finally { loading.value = false }
}
function reset() { stopSchoolPolling(); cancelDetachedSchoolFlow(active.value); smsCode.value = ''; active.value = undefined; email.value = undefined; materials.value = []; form.password = ''; form.document_number = ''; consent.value = false; notice.value = '' }
function selectSchool() { reset(); selectedMethod.value = availableMethods.value[0] ?? 'manual_material_review'; form.material_type = school.value?.material_types[0] ?? ''; kind.value = 'student' }
function selectMethod() { reset(); if (!manual.value) kind.value = 'student' }
async function action(fn: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await fn() } catch (e) { failure(e) } finally { busy.value = false; form.password = '' }
}
async function start() {
  await action(async () => {
    if (!school.value || !consent.value) throw new VerificationError('invalid_input')
    active.value = await verification.write('Application', '/api/v1/verification/applications', { school_id: school.value.id, method: selectedMethod.value, stage: chooseStudy.value ? stage.value : 'unknown', kind: chooseStudy.value ? kind.value : 'unknown', consent: consent.value, notice_version: school.value.notice_version } satisfies Schemas['CreateApplication'])
    await reload()
  })
}
async function resume(application: Schemas['Application']) {
  await action(async () => {
    selectedSchool.value = application.school_id; selectedMethod.value = application.method; stage.value = application.stage; kind.value = application.kind; active.value = application; consent.value = true
    materials.value = await verification.list('Material', `/api/v1/verification/applications/${application.id}/materials`)
    form.material_type = school.value?.material_types[0] ?? ''
    if (application.method === 'manual_material_review') {
      try { const saved = await verification.get('ManualInput', `/api/v1/verification/applications/${application.id}/form`); form.student_id = saved.student_id; form.name = saved.name; form.department = saved.department; form.email = saved.email; form.material_type = saved.material_type } catch (e) { if (!(e instanceof VerificationError && e.code === 'not_found')) throw e }
    }
    email.value = undefined
    if (emailMethod.value) { try { email.value = await verification.get('EmailChallenge', `/api/v1/verification/applications/${application.id}/email`) } catch (e) { if (!(e instanceof VerificationError && e.code === 'not_found')) throw e } }
  })
}
async function submit() {
  await action(async () => {
    if (mode.value === 'identity') {
      if (!school.value || !consent.value) throw new VerificationError('invalid_input')
      summary.value = await verification.write('Summary', '/api/v1/verification/identity', { student_id: form.student_id, name: form.name, document_number: form.document_number, password: '', school_id: school.value.id, notice_version: school.value.notice_version, consent: true } satisfies Schemas['IdentityInput'])
      form.document_number = ''; await reload(); notice.value = 'identityDone'; return
    }
    if (!active.value) throw new VerificationError('invalid_input')
    const path = `/api/v1/verification/applications/${active.value.id}`
    if (manual.value) {
      active.value = await verification.write('Application', `${path}/manual`, { student_id: form.student_id, name: form.name, department: form.department, email: form.email, material_type: form.material_type, material_ids: materials.value.map(m => m.id), revision: active.value.revision } satisfies Schemas['ManualInput'])
      notice.value = 'submitted'
    } else if (emailMethod.value) {
      email.value = await verification.write('EmailChallenge', `${path}/email`, { student_id: form.student_id, name: form.name } satisfies Schemas['EmailInput'])
    } else {
      active.value = await verification.write('Application', `${path}/verify`, { student_id: form.student_id, name: selectedMethod.value === 'school_sso' ? '' : form.name, document_number: form.document_number, password: form.password } satisfies Schemas['VerifyInput'])
      form.document_number = ''; notice.value = active.value.state === 'approved' ? 'verified' : 'schoolProgress'
    }
    await reload()
  })
}
async function confirmEmail() {
  await action(async () => {
    if (!active.value) return
    active.value = await verification.write('Application', `/api/v1/verification/applications/${active.value.id}/email/confirm`, { code: form.code })
    form.code = ''; notice.value = 'verified'; await reload()
  })
}
async function refreshApplication() {
  await action(async () => {
    if (!active.value) return
    active.value = active.value.school_challenge ? await schoolOperation(active.value, 'poll') : await verification.get('Application', `/api/v1/verification/applications/${active.value.id}`)
    materials.value = await verification.list('Material', `/api/v1/verification/applications/${active.value.id}/materials`)
    if (email.value) email.value = await verification.get('EmailChallenge', `/api/v1/verification/applications/${active.value.id}/email`)
    await reload()
  })
}
async function loadMore(section: keyof typeof hasMore) {
  await action(async () => {
    if (section === 'schools') { const rows = await verification.list('School', `/api/v1/verification/schools?limit=100&after=${encodeURIComponent(schools.value.at(-1)?.id ?? '')}`); schools.value.push(...rows); hasMore.schools = rows.length === 100 }
    if (section === 'applications') { const rows = await verification.list('Application', `/api/v1/verification/applications?limit=25&after=${encodeURIComponent(applications.value.at(-1)?.id ?? '')}`); applications.value.push(...rows); hasMore.applications = rows.length === 25 }
    if (section === 'credentials') { const rows = await verification.list('Credential', `/api/v1/verification/credentials?limit=25&after=${encodeURIComponent(credentials.value.at(-1)?.id ?? '')}`); credentials.value.push(...rows); hasMore.credentials = rows.length === 25 }
    if (section === 'requests') { const rows = await verification.list('RemovalRequest', `/api/v1/verification/requests?limit=25&after=${encodeURIComponent(requests.value.at(-1)?.id ?? '')}`); requests.value.push(...rows); hasMore.requests = rows.length === 25 }
  })
}
function captured(material: Schemas['Material']) { materials.value.push(material) }
async function removeMaterial(id: string) { await action(async () => { await verification.write('Material', `/api/v1/verification/materials/${id}`, undefined, 'DELETE'); materials.value = materials.value.filter(m => m.id !== id) }) }
async function requestRemoval() { await action(async () => { await verification.write('RemovalRequest', `/api/v1/verification/credentials/${removal.id}/requests`, { kind: removal.kind, reason: removal.reason } satisfies Schemas['RemovalInput']); removal.id = ''; removal.reason = ''; notice.value = 'requested'; await reload() }) }
async function suggest() { await action(async () => { await verification.write('Suggestion', '/api/v1/verification/suggestions', suggestion satisfies Schemas['SuggestionInput']); suggestion.name = ''; suggestion.website = ''; notice.value = 'suggested' }) }
function name(id: string) { return schools.value.find(s => s.id === id)?.name ?? id }
function stopSchoolPolling() { if (schoolTimer) clearTimeout(schoolTimer); schoolTimer = undefined }
async function schoolOperation(application: Schemas['Application'], actionName: 'poll' | 'submit_sms' | 'cancel') {
  const challenge = application.school_challenge
  if (!challenge) throw new VerificationError('conflict')
  return verification.write('Application', `/api/v1/verification/applications/${application.id}/school-challenge`, { action: actionName, challenge_id: challenge.id, revision: application.revision, code: actionName === 'submit_sms' ? smsCode.value : '' } satisfies Schemas['SchoolChallengeInput'], 'POST', controller.signal)
}
function cancelDetachedSchoolFlow(application?: Schemas['Application']) {
  if (!application?.school_challenge || !['processing', 'waiting_sms'].includes(application.school_challenge.state)) return
  const challenge = application.school_challenge
  void verification.write('Application', `/api/v1/verification/applications/${application.id}/school-challenge`, { action: 'cancel', challenge_id: challenge.id, revision: application.revision, code: '' } satisfies Schemas['SchoolChallengeInput']).catch(() => {
    // Navigation may interrupt cleanup; the bounded server session expires on its own.
    if (!controller.signal.aborted) error.value = 'network'
    else console.warn('School login cancellation unconfirmed; the short-lived session will expire.')
  })
}
async function continueSchool(actionName: 'submit_sms' | 'cancel') {
  await action(async () => {
    if (!active.value) return
    active.value = await schoolOperation(active.value, actionName); smsCode.value = ''
    if (active.value.state === 'approved') { notice.value = 'verified'; await reload() }
  })
}
async function pollSchool() {
  schoolTimer = undefined
  if (!active.value || !schoolPending.value || controller.signal.aborted || schoolPollCount >= 100) return
  if (busy.value) { scheduleSchoolPoll(); return }
  const current = active.value; schoolPollCount++
  try {
    const updated = await schoolOperation(current, 'poll')
    if (active.value?.id !== current.id || active.value?.school_challenge?.id !== current.school_challenge?.id) return
    active.value = updated
    if (updated.state === 'approved') { notice.value = 'verified'; await reload() }
    else scheduleSchoolPoll()
  } catch (e) { if (!controller.signal.aborted) failure(e) }
}
function scheduleSchoolPoll() { stopSchoolPolling(); if (schoolPending.value && schoolPollCount < 100) schoolTimer = setTimeout(() => { void pollSchool() }, 3000) }
watch(() => active.value?.school_challenge, challenge => { if (challenge?.id !== schoolPollId) { schoolPollId = challenge?.id ?? ''; schoolPollCount = 0 }; scheduleSchoolPoll() })
async function showProfile(id: string) { await action(async () => { profile.value = await verification.get('StudentProfile', `/api/v1/verification/credentials/${id}/profile`, controller.signal) }) }
function profileValue(value: unknown, field: string | number) {
  if (value === null) return t('verification.notProvided')
  if (field === 'identity_valid_until' && typeof value === 'string' && Number.isFinite(Date.parse(value))) return d(new Date(value), 'dateTime')
  return typeof value === 'string' ? value : JSON.stringify(value)
}
onMounted(reload)
onBeforeUnmount(() => { stopSchoolPolling(); cancelDetachedSchoolFlow(active.value); controller.abort() })
</script>

<template>
  <div class="verification-page">
    <header class="verification-heading">
      <div>
        <p class="eyebrow">
          {{ t('verification.personalCenter') }}
        </p><h1>{{ t('verification.title') }}</h1><p>{{ t('verification.description') }}</p>
      </div><button
        :disabled="loading || busy"
        @click="reload"
      >
        {{ t('verification.refresh') }}
      </button>
    </header>
    <p
      v-if="loading"
      role="status"
    >
      {{ t('verification.loading') }}
    </p>
    <p
      v-if="error"
      class="verification-alert"
      role="alert"
    >
      {{ t(`verification.errors.${error}`) }}
    </p>
    <p
      v-if="notice"
      class="verification-success"
      role="status"
    >
      {{ t(`verification.${notice}`) }}
    </p>
    <div
      v-if="summary"
      class="verification-summary"
    >
      <section><h2>{{ t('verification.studentStatus') }}</h2><strong>{{ t(summary.campus_eligibility ? 'verification.valid' : 'verification.notVerified') }}</strong></section>
      <section><h2>{{ t('verification.identityStatus') }}</h2><strong>{{ t(summary.identity_verified ? 'verification.verified' : 'verification.notVerified') }}</strong></section>
    </div>
    <p
      v-if="summary?.next_evaluation_at"
      class="verification-success"
    >
      {{ t('verification.newcomerReminder') }} {{ d(new Date(summary.next_evaluation_at), 'dateTime') }}
    </p>
    <section class="verification-card">
      <h2>{{ t('verification.start') }}</h2>
      <div
        class="verification-tabs"
        role="group"
        :aria-label="t('verification.entry')"
      >
        <button
          :aria-pressed="mode === 'student'"
          @click="mode = 'student'; reset()"
        >
          {{ t('verification.studentEntry') }}
        </button><button
          :aria-pressed="mode === 'identity'"
          @click="mode = 'identity'; reset()"
        >
          {{ t('verification.identityEntry') }}
        </button>
      </div>
      <p v-if="!schools.length && !loading">
        {{ t('verification.noSchools') }}
      </p>
      <form
        v-else
        class="verification-form"
        @submit.prevent="mode === 'identity' || active ? submit() : start()"
      >
        <label>{{ t('verification.school') }}<select
          v-model="selectedSchool"
          :aria-label="t('verification.school')"
          :disabled="busy"
          required
          @change="selectSchool"
        ><option
          v-for="s in schools"
          :key="s.id"
          :value="s.id"
        >{{ s.name }}</option></select></label>
        <button
          v-if="hasMore.schools"
          type="button"
          :disabled="busy"
          @click="loadMore('schools')"
        >
          {{ t('verification.loadMore') }}
        </button>
        <template v-if="mode === 'student'">
          <label>{{ t('verification.method') }}<select
            v-model="selectedMethod"
            :aria-label="t('verification.method')"
            :disabled="busy"
            required
            @change="selectMethod"
          ><option
            v-for="m in availableMethods"
            :key="m"
            :value="m"
          >{{ t(`verification.methods.${m}`) }}</option></select></label>
          <label v-if="chooseStudy">{{ t('verification.stage') }}<select
            v-model="stage"
            :aria-label="t('verification.stage')"
            :disabled="!!active || busy"
          ><option
            v-for="s in stages"
            :key="s"
            :value="s"
          >{{ t(`verification.stages.${s}`) }}</option></select></label>
          <label v-if="chooseStudy">{{ t('verification.kind') }}<select
            v-model="kind"
            :aria-label="t('verification.kind')"
            :disabled="!!active || busy"
          ><option
            v-for="k in kinds.filter(k => k !== 'newcomer' || manual)"
            :key="k"
            :value="k"
          >{{ t(`verification.kinds.${k}`) }}</option></select></label>
        </template>
        <p
          v-if="mode === 'identity' && !availableMethods.includes('real_name_identity_check')"
          class="full-width"
        >
          {{ t('verification.errors.method_unavailable') }}
        </p>
        <p
          v-if="!chooseStudy && mode === 'student'"
          class="full-width"
        >
          {{ t('verification.schoolFacts') }}
        </p>
        <p
          v-if="school?.profile_schema === 'bit.v1' && selectedMethod === 'school_sso'"
          class="full-width privacy-note"
        >
          {{ t('verification.bitPrivacy') }}
        </p>
        <p class="full-width privacy-note">
          {{ t('verification.privacy') }}
        </p>
        <label class="full-width checkbox-label"><input
          v-model="consent"
          type="checkbox"
          :disabled="!!active || busy"
          required
        >{{ t('verification.consent') }}</label>
        <template v-if="writable || mode === 'identity'">
          <label>{{ t('verification.studentId') }}<input
            v-model.trim="form.student_id"
            autocomplete="off"
            maxlength="64"
            required
            :disabled="busy"
          ></label>
          <label v-if="selectedMethod !== 'school_sso' || mode === 'identity'">{{ t('verification.name') }}<input
            v-model.trim="form.name"
            autocomplete="name"
            maxlength="100"
            required
            :disabled="busy"
          ></label>
          <label v-if="selectedMethod === 'real_name_identity_check' || mode === 'identity'">{{ t('verification.document') }}<input
            v-model.trim="form.document_number"
            autocomplete="off"
            maxlength="32"
            required
            :disabled="busy"
          ></label>
          <label v-if="selectedMethod === 'school_sso' && mode === 'student'">{{ t('verification.password') }}<input
            v-model="form.password"
            type="password"
            autocomplete="off"
            maxlength="256"
            required
            :disabled="busy"
          ></label>
          <template v-if="manual && mode === 'student'">
            <label>{{ t('verification.department') }}<input
              v-model.trim="form.department"
              maxlength="100"
              required
              :disabled="busy"
            ></label>
            <label>{{ t('verification.contactEmail') }}<input
              v-model.trim="form.email"
              type="email"
              maxlength="254"
              required
              :disabled="busy"
            ></label>
            <label>{{ t('verification.materialType') }}<select
              v-model="form.material_type"
              :aria-label="t('verification.materialType')"
              required
              :disabled="busy"
            ><option
              v-for="m in school?.material_types"
              :key="m"
              :value="m"
            >{{ t(`verification.materialTypes.${m}`, m) }}</option></select></label>
            <div
              v-if="active"
              class="full-width"
            >
              <CameraCapture
                :key="active.id"
                :application-id="active.id"
                @captured="captured"
              /><p>{{ t('verification.capturedMaterials') }} {{ n(materials.length) }}</p><ul>
                <li
                  v-for="(m, index) in materials"
                  :key="m.id"
                >
                  {{ t('verification.photo') }} {{ n(index + 1) }} <button
                    type="button"
                    :disabled="busy"
                    @click="removeMaterial(m.id)"
                  >
                    {{ t('verification.remove') }}
                  </button>
                </li>
              </ul>
            </div>
          </template>
        </template>
        <div class="full-width verification-actions">
          <button
            v-if="!active || writable || mode === 'identity'"
            type="submit"
            :disabled="busy || !school || !consent || (mode === 'student' && !availableMethods.length) || (mode === 'identity' && !availableMethods.includes('real_name_identity_check')) || (mode === 'student' && !!active && manual && !materials.length)"
          >
            {{ t(!active && mode === 'student' ? 'verification.continue' : emailMethod && mode === 'student' ? 'verification.createChallenge' : 'verification.submit') }}
          </button>
          <button
            v-if="active"
            type="button"
            :disabled="busy"
            @click="refreshApplication"
          >
            {{ t('verification.refreshStatus') }}
          </button>
        </div>
      </form>
      <section
        v-if="active?.school_challenge"
        class="email-challenge"
        aria-live="polite"
      >
        <h3>{{ t('verification.schoolProgress') }}</h3>
        <p>{{ t(`verification.schoolStates.${active.school_challenge.state}`) }}</p>
        <p v-if="active.school_challenge.code">
          {{ t(`verification.schoolErrors.${active.school_challenge.code}`) }}
        </p>
        <p>{{ t('verification.expires') }} {{ d(new Date(active.school_challenge.expires_at), 'dateTime') }}</p>
        <form
          v-if="active.school_challenge.state === 'waiting_sms'"
          class="verification-actions"
          @submit.prevent="continueSchool('submit_sms')"
        >
          <p>{{ t('verification.schoolSMSHelp', { phone: active.school_challenge.masked_phone }) }}</p>
          <label>{{ t('verification.schoolSMS') }}<input
            v-model="smsCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{4,8}"
            maxlength="8"
            required
            :disabled="busy"
          ></label>
          <button :disabled="busy">
            {{ t('verification.confirm') }}
          </button>
        </form>
        <button
          v-if="schoolPending"
          type="button"
          :disabled="busy"
          @click="continueSchool('cancel')"
        >
          {{ t('verification.cancelSchool') }}
        </button>
      </section>
      <div
        v-if="active"
        class="application-status"
        role="status"
      >
        <p>{{ t('verification.applicationState') }} {{ t(`verification.states.${active.state}`) }}</p><p v-if="active.review_note">
          {{ active.review_note }}
        </p><p v-if="active.qualification_expires_at">
          {{ t('verification.expires') }} {{ d(new Date(active.qualification_expires_at), 'dateTime') }}
        </p>
      </div>
      <section
        v-if="email && writable"
        class="email-challenge"
      >
        <p>{{ email.masked_email }} {{ t(`verification.states.${email.state}`) }}</p>
        <p>{{ t('verification.expires') }} {{ d(new Date(email.expires_at), 'dateTime') }}</p>
        <template v-if="selectedMethod === 'student_email_inbound_challenge'">
          <p>{{ t('verification.inboundHelp') }}</p><code class="email-target">{{ email.target_address }}</code>
        </template>
        <form
          v-else
          class="verification-actions"
          @submit.prevent="confirmEmail"
        >
          <label>{{ t('verification.code') }}<input
            v-model="form.code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength="6"
            required
          ></label><button :disabled="busy">
            {{ t('verification.confirm') }}
          </button>
        </form>
      </section>
    </section>
    <section class="verification-card">
      <h2>{{ t('verification.experiences') }}</h2><p>{{ t('verification.validityHelp') }}</p><p v-if="!credentials.length">
        {{ t('verification.empty') }}
      </p><div class="credential-grid">
        <article
          v-for="c in credentials"
          :key="c.id"
        >
          <h3>{{ name(c.school_id) }}</h3><p>{{ t(`verification.stages.${c.stage}`) }} {{ t(`verification.kinds.${c.kind}`) }}</p><p>{{ c.student_display }} {{ t(`verification.states.${c.state}`) }}</p><p v-if="c.state === 'active' || c.expires_at">
            {{ c.expires_at ? `${t('verification.expires')} ${d(new Date(c.expires_at), 'dateTime')}` : t('verification.permanent') }}
          </p><div
            v-if="c.state !== 'deleted'"
            class="verification-actions"
          >
            <button
              :disabled="busy"
              @click="showProfile(c.id)"
            >
              {{ t('verification.viewProfile') }}
            </button>
            <button
              v-if="c.state === 'active'"
              @click="removal.id = c.id; removal.kind = 'revoke'"
            >
              {{ t('verification.requestRevoke') }}
            </button><button @click="removal.id = c.id; removal.kind = 'delete'">
              {{ t('verification.requestDelete') }}
            </button>
          </div>
        </article>
      </div>
      <button
        v-if="hasMore.credentials"
        :disabled="busy"
        @click="loadMore('credentials')"
      >
        {{ t('verification.loadMore') }}
      </button>
      <form
        v-if="removal.id"
        class="verification-form"
        @submit.prevent="requestRemoval"
      >
        <p class="full-width">
          {{ t('verification.removalHelp') }}
        </p><label class="full-width">{{ t('verification.reason') }}<textarea
          v-model.trim="removal.reason"
          maxlength="500"
          required
        /></label><div class="verification-actions">
          <button :disabled="busy">
            {{ t('verification.submitRequest') }}
          </button><button
            type="button"
            @click="removal.id = ''"
          >
            {{ t('verification.cancel') }}
          </button>
        </div>
      </form>
    </section>
    <section
      v-if="profile"
      class="verification-card student-profile"
    >
      <h2>{{ t('verification.profileTitle') }}</h2>
      <p>{{ t(`verification.profileStatus.${profile.data_status}`) }}</p>
      <p v-if="profile.collected_at">
        {{ t('verification.collectedAt') }} {{ d(new Date(profile.collected_at), 'dateTime') }}
      </p>
      <dl>
        <template
          v-for="(value, field) in profile.fields"
          :key="field"
        >
          <dt>{{ t(`verification.profileFields.${field}`) }}<small v-if="profile.field_sources[field]"> {{ t(`verification.profileSources.${profile.field_sources[field]}`) }}</small></dt><dd>{{ profileValue(value, field) }}</dd>
        </template>
      </dl>
      <button @click="profile = undefined">
        {{ t('verification.closeProfile') }}
      </button>
    </section>
    <section class="verification-card">
      <h2>{{ t('verification.applications') }}</h2><p v-if="!applications.length">
        {{ t('verification.empty') }}
      </p><ul class="verification-list">
        <li
          v-for="a in applications"
          :key="a.id"
        >
          <div>
            <strong>{{ name(a.school_id) }}</strong><p>{{ t(`verification.methods.${a.method}`) }} {{ t(`verification.states.${a.state}`) }}</p><p v-if="a.review_note">
              {{ a.review_note }}
            </p>
          </div><button
            v-if="['in_progress', 'supplement_required'].includes(a.state)"
            :disabled="busy"
            @click="resume(a)"
          >
            {{ t('verification.continue') }}
          </button>
        </li>
      </ul>
      <button
        v-if="hasMore.applications"
        :disabled="busy"
        @click="loadMore('applications')"
      >
        {{ t('verification.loadMore') }}
      </button>
    </section>
    <section
      v-if="requests.length"
      class="verification-card"
    >
      <h2>{{ t('verification.requests') }}</h2><ul class="verification-list">
        <li
          v-for="r in requests"
          :key="r.id"
        >
          <div>
            <strong>{{ name(r.school_id) }} {{ t(`verification.states.${r.state}`) }}</strong><p>{{ r.reason }}</p><p v-if="r.note">
              {{ r.note }}
            </p>
          </div>
        </li>
      </ul>
      <button
        v-if="hasMore.requests"
        :disabled="busy"
        @click="loadMore('requests')"
      >
        {{ t('verification.loadMore') }}
      </button>
    </section>
    <details class="verification-card">
      <summary>{{ t('verification.suggestSchool') }}</summary><form
        class="verification-form"
        @submit.prevent="suggest"
      >
        <label>{{ t('verification.schoolName') }}<input
          v-model.trim="suggestion.name"
          maxlength="100"
          required
        ></label><label>{{ t('verification.website') }}<input
          v-model.trim="suggestion.website"
          type="url"
          pattern="https://.*"
          maxlength="500"
          required
        ></label><button :disabled="busy">
          {{ t('verification.submit') }}
        </button>
      </form>
    </details>
  </div>
</template>
