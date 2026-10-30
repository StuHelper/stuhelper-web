<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useSession } from '../../shared/session'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import MeLayout from '../account/MeLayout.vue'
import { kinds, stages } from './api'
import CameraCapture from './CameraCapture.vue'
import { useVerificationFlow } from './flow'

const { t, te } = useI18n()
const format = useFormat()
const session = useSession()
const flow = useVerificationFlow()
const { form, removal, suggestion } = flow
onMounted(flow.reload)

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
</script>

<template>
  <MeLayout
    :title="t('verification.title')"
    :description="t('verification.description')"
  >
    <template #actions>
      <button
        class="btn"
        type="button"
        :disabled="flow.loading.value || flow.busy.value"
        @click="flow.reload"
      >
        {{ t('common.refresh') }}
      </button>
    </template>

    <div class="stack-lg">
      <ErrorNotice
        v-if="flow.error.value"
        :code="flow.error.value"
        @retry="flow.reload"
      />
      <p
        v-if="flow.notice.value"
        class="notice notice-success"
        role="status"
      >
        {{ t(`verification.notice.${flow.notice.value}`) }}
      </p>

      <section
        class="grid status-cards"
        :aria-label="t('verification.statusTitle')"
        :aria-busy="flow.loading.value"
      >
        <article class="card stack-sm">
          <h2 class="small muted">
            {{ t('verification.campus') }}
          </h2>
          <StatusTag
            v-if="flow.summary.value"
            :tone="flow.summary.value.campus_eligibility ? 'success' : 'neutral'"
          >
            {{ t(flow.summary.value.campus_eligibility ? 'verification.eligible' : 'verification.notEligible') }}
          </StatusTag>
          <p
            v-if="flow.summary.value?.next_evaluation_at"
            class="small notice notice-warning"
          >
            {{ t('verification.newcomerReminder', { time: format.dateTime(flow.summary.value.next_evaluation_at) }) }}
          </p>
        </article>
        <article class="card stack-sm">
          <h2 class="small muted">
            {{ t('verification.identity') }}
          </h2>
          <StatusTag
            v-if="flow.summary.value"
            :tone="flow.summary.value.identity_verified ? 'success' : 'neutral'"
          >
            {{ t(flow.summary.value.identity_verified ? 'verification.identityVerified' : 'verification.identityMissing') }}
          </StatusTag>
        </article>
        <article class="card stack-sm">
          <h2 class="small muted">
            {{ t('verification.phone') }}
          </h2>
          <StatusTag
            v-if="session.session.value"
            :tone="session.session.value.phone_bound ? 'success' : 'neutral'"
          >
            {{ t(session.session.value.phone_bound ? 'verification.phoneBound' : 'verification.phoneMissing') }}
          </StatusTag>
        </article>
      </section>

      <section class="card stack">
        <h2>{{ t('verification.start') }}</h2>
        <div
          class="row"
          role="group"
          :aria-label="t('verification.entry')"
        >
          <button
            class="btn btn-sm"
            type="button"
            :aria-pressed="flow.mode.value === 'student'"
            @click="flow.selectMode('student')"
          >
            {{ t('verification.studentEntry') }}
          </button>
          <button
            class="btn btn-sm"
            type="button"
            :aria-pressed="flow.mode.value === 'identity'"
            @click="flow.selectMode('identity')"
          >
            {{ t('verification.identityEntry') }}
          </button>
        </div>
        <p
          v-if="!flow.schools.value.length && !flow.loading.value"
          class="empty"
        >
          {{ t('verification.noSchools') }}
        </p>
        <form
          v-else
          class="stack"
          @submit.prevent="flow.mode.value === 'identity' || flow.active.value ? flow.submit() : flow.start()"
        >
          <div class="form-grid">
            <label class="field">
              <span class="field-label">{{ t('verification.school') }}</span>
              <select
                v-model="flow.selectedSchool.value"
                class="select"
                :disabled="flow.busy.value"
                required
                @change="flow.selectSchool"
              >
                <option
                  v-for="item in flow.schools.value"
                  :key="item.id"
                  :value="item.id"
                >{{ item.name }}</option>
              </select>
            </label>
            <template v-if="flow.mode.value === 'student'">
              <label class="field">
                <span class="field-label">{{ t('verification.method') }}</span>
                <select
                  v-model="flow.selectedMethod.value"
                  class="select"
                  :disabled="flow.busy.value || !!flow.active.value"
                  required
                  @change="flow.selectMethod"
                >
                  <option
                    v-for="method in flow.availableMethods.value"
                    :key="method"
                    :value="method"
                  >{{ t(`verification.methods.${method}`) }}</option>
                </select>
              </label>
              <label
                v-if="flow.chooseStudy.value"
                class="field"
              >
                <span class="field-label">{{ t('verification.stage') }}</span>
                <select
                  v-model="flow.stage.value"
                  class="select"
                  :disabled="!!flow.active.value || flow.busy.value"
                >
                  <option
                    v-for="item in stages"
                    :key="item"
                    :value="item"
                  >{{ t(`verification.stages.${item}`) }}</option>
                </select>
              </label>
              <label
                v-if="flow.chooseStudy.value"
                class="field"
              >
                <span class="field-label">{{ t('verification.kind') }}</span>
                <select
                  v-model="flow.kind.value"
                  class="select"
                  :disabled="!!flow.active.value || flow.busy.value"
                >
                  <option
                    v-for="item in kinds.filter((value) => value !== 'newcomer' || flow.manual.value)"
                    :key="item"
                    :value="item"
                  >{{ t(`verification.kinds.${item}`) }}</option>
                </select>
              </label>
            </template>
          </div>
          <button
            v-if="flow.cursors.schools"
            class="btn btn-sm btn-ghost"
            type="button"
            :disabled="flow.busy.value"
            @click="flow.loadMore('schools')"
          >
            {{ t('verification.moreSchools') }}
          </button>

          <p
            v-if="flow.mode.value === 'identity' && !flow.availableMethods.value.includes('real_name_identity_check')"
            class="notice notice-warning small"
          >
            {{ t('errors.method_unavailable') }}
          </p>
          <p
            v-if="!flow.chooseStudy.value && flow.mode.value === 'student'"
            class="small muted"
          >
            {{ t('verification.schoolFacts') }}
          </p>
          <p
            v-if="flow.school.value?.profile_schema === 'bit.v1' && flow.selectedMethod.value === 'school_sso'"
            class="small notice notice-info"
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
              :disabled="!!flow.active.value || flow.busy.value"
              required
            >
            <span>{{ t('verification.consent') }}</span>
          </label>

          <div
            v-if="flow.writable.value || flow.mode.value === 'identity'"
            class="form-grid"
          >
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
              v-if="flow.selectedMethod.value !== 'school_sso' || flow.mode.value === 'identity'"
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
              v-if="flow.selectedMethod.value === 'real_name_identity_check' || flow.mode.value === 'identity'"
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
              v-if="flow.selectedMethod.value === 'school_sso' && flow.mode.value === 'student'"
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
            <template v-if="flow.manual.value && flow.mode.value === 'student'">
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
                <select
                  v-model="form.material_type"
                  class="select"
                  required
                  :disabled="flow.busy.value"
                >
                  <option
                    v-for="type in flow.school.value?.material_types"
                    :key="type"
                    :value="type"
                  >{{ label('verification.materialTypes', type, type) }}</option>
                </select>
              </label>
            </template>
          </div>

          <div
            v-if="flow.active.value && flow.manual.value && flow.mode.value === 'student' && flow.writable.value"
            class="stack-sm"
          >
            <CameraCapture
              :key="flow.active.value.id"
              :application-id="flow.active.value.id"
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

          <div class="form-actions">
            <button
              v-if="!flow.active.value || flow.writable.value || flow.mode.value === 'identity'"
              class="btn btn-primary"
              type="submit"
              :disabled="flow.busy.value || !flow.school.value || !flow.consent.value || (flow.mode.value === 'student' && !flow.availableMethods.value.length) || (flow.mode.value === 'identity' && !flow.availableMethods.value.includes('real_name_identity_check')) || (flow.mode.value === 'student' && !!flow.active.value && flow.manual.value && !flow.materials.value.length)"
            >
              {{ t(!flow.active.value && flow.mode.value === 'student' ? 'verification.continue' : flow.emailMethod.value && flow.mode.value === 'student' ? 'verification.createChallenge' : 'verification.submit') }}
            </button>
            <button
              v-if="flow.active.value"
              class="btn"
              type="button"
              :disabled="flow.busy.value"
              @click="flow.refreshApplication"
            >
              {{ t('verification.refreshStatus') }}
            </button>
          </div>
        </form>

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

        <div
          v-if="flow.active.value"
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

        <section
          v-if="flow.email.value && flow.writable.value"
          class="notice notice-info stack"
        >
          <p>{{ flow.email.value.masked_email }} · {{ label('verification.states', flow.email.value.state) }}</p>
          <p class="subtle">
            {{ t('verification.expiresAt', { time: format.dateTime(flow.email.value.expires_at) }) }}
          </p>
          <template v-if="flow.selectedMethod.value === 'student_email_inbound_challenge'">
            <p class="small">
              {{ t('verification.inboundHelp') }}
            </p>
            <code class="mono">{{ flow.email.value.target_address }}</code>
          </template>
          <form
            v-else
            class="row"
            @submit.prevent="flow.confirmEmail"
          >
            <label class="field">
              <span class="field-label">{{ t('verification.emailCode') }}</span>
              <input
                v-model="form.code"
                class="input"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]{6}"
                maxlength="6"
                required
              >
            </label>
            <button
              class="btn btn-primary"
              :disabled="flow.busy.value"
            >
              {{ t('common.confirm') }}
            </button>
          </form>
        </section>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>{{ t('verification.experiences') }}</h2>
        </div>
        <p class="small muted">
          {{ t('verification.validityHelp') }}
        </p>
        <p
          v-if="!flow.credentials.value.length && !flow.loading.value"
          class="empty"
        >
          {{ t('verification.noCredentials') }}
        </p>
        <ul class="grid-wide list">
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
              {{ t(`verification.stages.${credential.stage}`) }} · {{ t(`verification.kinds.${credential.kind}`) }} · {{ credential.student_display }}
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
          </li>
        </ul>
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
        v-if="flow.profile.value"
        class="card stack"
      >
        <div class="row-between">
          <h2>{{ t('verification.profileTitle') }}</h2>
          <button
            class="btn btn-sm"
            type="button"
            @click="flow.profile.value = undefined"
          >
            {{ t('common.close') }}
          </button>
        </div>
        <p class="small">
          {{ label('verification.profileStatus', flow.profile.value.data_status) }}
        </p>
        <p
          v-if="flow.profile.value.collected_at"
          class="subtle"
        >
          {{ t('verification.collectedAt', { time: format.dateTime(flow.profile.value.collected_at) }) }}
        </p>
        <dl class="facts">
          <div
            v-for="(value, field) in flow.profile.value.fields"
            :key="field"
          >
            <dt>
              {{ label('verification.profileFields', String(field)) }}
              <small v-if="flow.profile.value.field_sources[field]"> · {{ label('verification.profileSources', flow.profile.value.field_sources[field] ?? '') }}</small>
            </dt>
            <dd>{{ profileValue(value, String(field)) }}</dd>
          </div>
        </dl>
      </section>

      <section class="section">
        <h2>{{ t('verification.applications') }}</h2>
        <p
          v-if="!flow.applications.value.length && !flow.loading.value"
          class="empty"
        >
          {{ t('verification.noApplications') }}
        </p>
        <ul class="list">
          <li
            v-for="application in flow.applications.value"
            :key="application.id"
            class="card row-between"
          >
            <div class="stack-sm">
              <strong>{{ flow.schoolName(application.school_id) || t('common.unknown') }}</strong>
              <span class="small">{{ t(`verification.methods.${application.method}`) }} · {{ label('verification.states', application.state) }}</span>
              <span
                v-if="application.review_note"
                class="small muted"
              >{{ application.review_note }}</span>
              <span class="subtle">{{ format.dateTime(application.updated_at) }}</span>
            </div>
            <button
              v-if="['in_progress', 'supplement_required'].includes(application.state)"
              class="btn btn-sm"
              type="button"
              :disabled="flow.busy.value"
              @click="flow.resume(application)"
            >
              {{ t('verification.continue') }}
            </button>
          </li>
        </ul>
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
        v-if="flow.requests.value.length"
        class="section"
      >
        <h2>{{ t('verification.requests') }}</h2>
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

      <details class="card">
        <summary>{{ t('verification.suggestSchool') }}</summary>
        <form
          class="form-grid suggest"
          @submit.prevent="flow.suggest"
        >
          <label class="field">
            <span class="field-label">{{ t('verification.schoolName') }}</span>
            <input
              v-model.trim="suggestion.name"
              class="input"
              maxlength="100"
              required
            >
          </label>
          <label class="field">
            <span class="field-label">{{ t('verification.website') }}</span>
            <input
              v-model.trim="suggestion.website"
              class="input"
              type="url"
              pattern="https://.*"
              maxlength="500"
              required
            >
          </label>
          <button
            class="btn btn-primary"
            :disabled="flow.busy.value"
          >
            {{ t('common.submit') }}
          </button>
        </form>
      </details>
    </div>
  </MeLayout>
</template>

<style scoped>
.status-cards { grid-template-columns: repeat(auto-fill, minmax(min(100%, 13rem), 1fr)); }
.suggest { margin-block-start: 1rem; }
details summary { cursor: pointer; font-weight: 600; }
</style>
