<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useTask } from '../../shared/composables/async'
import { useLeaveGuard } from '../../shared/composables/leave'
import AsyncState from '../../shared/ui/AsyncState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic } from '../academic/api'
import CameraCapture from './CameraCapture.vue'
import { teacherDisclosures, useVerification, type Application, type Material, type School, type TeacherCredential, type TeacherDisclosure } from './api'

// Teacher verification: the person applies with photographed evidence, an
// administrator reviews it and binds catalog teacher profiles. Each public
// attribute is shown only with the person's consent, and can be changed later.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useVerification()
const academic = useAcademic()

const data = useAsync(async (signal) => {
  const [schools, applications, owned] = await Promise.all([
    api.list('School', '/api/v1/verification/schools', { limit: 100, signal }),
    api.list('Application', '/api/v1/verification/applications', { limit: 100, signal }),
    api.list('TeacherCredential', '/api/v1/verification/teacher-credentials', { limit: 100, signal }),
  ])
  const teacherApps = applications.items.filter((item) => item.kind === 'teacher')
  const ids = owned.items.flatMap((item) => item.teacher_ids)
  const names = ids.length ? await academic.lookup(ids, signal).catch(() => new Map<string, { name: string }>()) : new Map<string, { name: string }>()
  return { schools: schools.items.filter((item) => item.enabled), applications: teacherApps, credentials: owned.items, names }
})
void data.reload()
const open = computed(() => data.data.value?.applications.find((item) => ['in_progress', 'supplement_required', 'pending_review'].includes(item.state)))
const decided = computed(() => data.data.value?.applications.filter((item) => item !== open.value) ?? [])
const schoolOf = (id: string) => data.data.value?.schools.find((item) => item.id === id)
const appTone = (state: Application['state']) => (state === 'approved' ? 'success' : state === 'rejected' || state === 'expired' ? 'danger' : state === 'supplement_required' ? 'warning' : 'info')

// Starting an application requires choosing the school and accepting its notice.
const task = useTask()
const school = ref('')
const consent = ref(false)
async function start() {
  const chosen = data.data.value?.schools.find((item) => item.id === school.value)
  if (!chosen || !consent.value) return
  const created = await task.run(() => api.write('Application', '/api/v1/verification/teacher-applications', { school_id: chosen.id, notice_version: chosen.notice_version, consent: true }))
  if (created) {
    consent.value = false
    await data.reload()
    void loadForm(created)
  }
}

// The form of the open application: identity facts, evidence and disclosure choices.
const form = reactive({ name: '', organization: '', gender: '', email: '', material_type: '', disclosures: [] as TeacherDisclosure[] })
const materials = ref<Material[]>([])
const baseline = ref('')
const formFor = ref('')
const editable = computed(() => !!open.value && open.value.state !== 'pending_review')
const dirty = computed(() => !!formFor.value && JSON.stringify([form, materials.value.map((item) => item.id)]) !== baseline.value)
useLeaveGuard(() => (dirty.value || task.busy.value ? t('common.leaveUnsaved') : ''))
async function loadForm(application: Application) {
  if (formFor.value === application.id) return
  formFor.value = application.id
  const path = `/api/v1/verification/applications/${encodeURIComponent(application.id)}`
  materials.value = (await api.list('Material', `${path}/materials`)).items
  const types = schoolOf(application.school_id)?.material_types ?? []
  Object.assign(form, { name: '', organization: '', gender: '', email: '', material_type: types[0] ?? '', disclosures: ['teacher'] })
  try {
    const saved = await api.get('TeacherForm', `${path}/teacher-form`)
    Object.assign(form, { name: saved.name, organization: saved.organization, gender: saved.gender ?? '', email: saved.email, material_type: saved.material_type || form.material_type, disclosures: [...saved.disclosures] })
  } catch (failure) {
    if (errorCode(failure) !== 'not_found') toast(errorText(errorCode(failure)))
  }
  baseline.value = JSON.stringify([form, materials.value.map((item) => item.id)])
}
const ready = computed(() => !!form.name.trim() && !!form.organization.trim() && /^[^\s@]+@[^\s@]+$/.test(form.email.trim()) && !!form.material_type && materials.value.length > 0 && materials.value.length <= 5)
async function submit() {
  const application = open.value
  if (!application || !ready.value) return
  const body = { name: form.name.trim(), organization: form.organization.trim(), ...(form.gender.trim() ? { gender: form.gender.trim() } : {}), email: form.email.trim(), material_type: form.material_type, material_ids: materials.value.map((item) => item.id), disclosures: teacherDisclosures.filter((item) => form.disclosures.includes(item)), revision: application.revision }
  const result = await task.run(() => api.write('Application', `/api/v1/verification/applications/${encodeURIComponent(application.id)}/teacher-form`, body, 'PUT'))
  if (result) {
    baseline.value = JSON.stringify([form, materials.value.map((item) => item.id)])
    toast(t('teacher.submitted'))
    await data.reload()
  }
}
function captured(material: Material) {
  materials.value = [...materials.value, material]
}
async function removeMaterial(id: string) {
  const removed = await task.run(() => api.write('Material', `/api/v1/verification/materials/${encodeURIComponent(id)}`, undefined, 'DELETE'))
  if (removed) materials.value = materials.value.filter((item) => item.id !== id)
}

// Public attributes of an approved qualification.
const editing = shallowRef<TeacherCredential>()
const shown = ref<TeacherDisclosure[]>([])
function editDisclosures(credential: TeacherCredential) {
  editing.value = credential
  shown.value = [...credential.disclosures]
}
async function saveDisclosures() {
  const credential = editing.value
  if (!credential) return
  const result = await task.run(() => api.write('TeacherCredential', `/api/v1/verification/teacher-credentials/${encodeURIComponent(credential.id)}/disclosures`, { revision: credential.revision, disclosures: teacherDisclosures.filter((item) => shown.value.includes(item)) }, 'PUT'))
  if (result) {
    editing.value = undefined
    toast(t('teacher.disclosuresSaved'))
    await data.reload()
  }
}
function schoolName(id: string, schools: School[]) {
  return schools.find((item) => item.id === id)?.name ?? t('common.unknown')
}
</script>

<template>
  <MeLayout
    :title="t('teacher.title')"
    :description="t('teacher.description')"
  >
    <AsyncState
      :status="data.status.value"
      :error="data.error.value"
      @retry="data.reload()"
    >
      <template v-if="data.data.value">
        <p
          v-if="task.error.value"
          class="notice notice-warning"
          role="alert"
        >
          {{ errorText(task.error.value) }}
        </p>

        <section
          v-if="data.data.value.credentials.length"
          class="section"
          aria-labelledby="teacher-credentials"
        >
          <h2
            id="teacher-credentials"
            class="d-title"
          >
            {{ t('teacher.credentials') }}
          </h2>
          <ul class="list">
            <li
              v-for="credential in data.data.value.credentials"
              :key="credential.id"
              class="card stack-sm"
            >
              <div class="row-between">
                <b>{{ schoolName(credential.school_id, data.data.value.schools) }}</b>
                <StatusTag :tone="credential.state === 'active' ? 'success' : 'neutral'">
                  {{ t(`teacher.credentialState.${credential.state}`) }}
                </StatusTag>
              </div>
              <p class="subtle">
                {{ t('teacher.profiles', { names: format.list(credential.teacher_ids.map((id) => data.data.value?.names.get(id)?.name ?? id)) }) }}
              </p>
              <p class="subtle">
                {{ credential.expires_at ? t('teacher.validUntil', { date: format.date(credential.expires_at) }) : t('teacher.noExpiry') }}
              </p>
              <p
                v-if="credential.note"
                class="small muted"
              >
                {{ t('teacher.note', { note: credential.note }) }}
              </p>
              <template v-if="credential.state === 'active'">
                <div
                  v-if="editing?.id !== credential.id"
                  class="row"
                >
                  <span
                    v-for="item in credential.disclosures"
                    :key="item"
                    class="tag"
                  >{{ t(`teacher.disclosure.${item}`) }}</span>
                  <span
                    v-if="!credential.disclosures.length"
                    class="subtle"
                  >{{ t('teacher.nothingPublic') }}</span>
                  <button
                    class="btn btn-sm"
                    type="button"
                    @click="editDisclosures(credential)"
                  >
                    {{ t('teacher.changeDisclosures') }}
                  </button>
                </div>
                <fieldset
                  v-else
                  class="stack-sm"
                  :disabled="task.busy.value"
                >
                  <legend class="field-label">
                    {{ t('teacher.disclosureLegend') }}
                  </legend>
                  <label
                    v-for="item in teacherDisclosures"
                    :key="item"
                    class="check"
                  >
                    <input
                      v-model="shown"
                      type="checkbox"
                      :value="item"
                    >
                    <span>{{ t(`teacher.disclosure.${item}`) }}</span>
                  </label>
                  <div class="row">
                    <button
                      class="btn btn-sm btn-primary"
                      type="button"
                      @click="saveDisclosures"
                    >
                      {{ t('common.save') }}
                    </button>
                    <button
                      class="btn btn-sm"
                      type="button"
                      @click="editing = undefined"
                    >
                      {{ t('common.cancel') }}
                    </button>
                  </div>
                </fieldset>
              </template>
            </li>
          </ul>
        </section>

        <section
          v-if="open"
          class="section"
          aria-labelledby="teacher-application"
        >
          <h2
            id="teacher-application"
            class="d-title"
          >
            {{ t('teacher.application') }}
          </h2>
          <div class="card stack">
            <div class="row-between">
              <b>{{ schoolName(open.school_id, data.data.value.schools) }}</b>
              <StatusTag :tone="appTone(open.state)">
                {{ t(`teacher.applicationState.${open.state}`) }}
              </StatusTag>
            </div>
            <p
              v-if="open.review_note"
              class="notice notice-warning small"
            >
              {{ t('teacher.reviewNote', { note: open.review_note }) }}
            </p>
            <p
              v-if="open.state === 'pending_review'"
              class="muted small"
            >
              {{ t('teacher.waiting') }}
            </p>
            <button
              v-if="editable && formFor !== open.id"
              class="btn btn-primary"
              type="button"
              @click="loadForm(open)"
            >
              {{ t(open.state === 'supplement_required' ? 'teacher.supplement' : 'teacher.fillForm') }}
            </button>
            <form
              v-if="editable && formFor === open.id"
              class="stack"
              novalidate
              @submit.prevent="submit"
            >
              <fieldset
                class="stack"
                :disabled="task.busy.value"
              >
                <label class="field">
                  <span class="field-label">{{ t('teacher.name') }}</span>
                  <input
                    v-model="form.name"
                    class="input"
                    maxlength="100"
                    autocomplete="name"
                  >
                </label>
                <label class="field">
                  <span class="field-label">{{ t('teacher.organization') }}</span>
                  <input
                    v-model="form.organization"
                    class="input"
                    maxlength="100"
                    autocomplete="organization"
                  >
                </label>
                <label class="field">
                  <span class="field-label">{{ t('teacher.gender') }}</span>
                  <input
                    v-model="form.gender"
                    class="input"
                    maxlength="32"
                  >
                </label>
                <div class="field">
                  <label
                    class="field-label"
                    for="teacher-email"
                  >{{ t('teacher.email') }}</label>
                  <input
                    id="teacher-email"
                    v-model="form.email"
                    class="input"
                    type="email"
                    maxlength="254"
                    autocomplete="email"
                    aria-describedby="teacher-email-hint"
                  >
                  <span
                    id="teacher-email-hint"
                    class="field-hint"
                  >{{ t('teacher.emailHint') }}</span>
                </div>
                <fieldset class="stack-sm">
                  <legend class="field-label">
                    {{ t('teacher.materialType') }}
                  </legend>
                  <label
                    v-for="type in schoolOf(open.school_id)?.material_types ?? []"
                    :key="type"
                    class="check"
                  >
                    <input
                      v-model="form.material_type"
                      type="radio"
                      :value="type"
                    >
                    <span>{{ type }}</span>
                  </label>
                </fieldset>
                <div class="stack-sm">
                  <span class="field-label">{{ t('teacher.materials', { count: format.number(materials.length) }) }}</span>
                  <ul
                    v-if="materials.length"
                    class="row"
                  >
                    <li
                      v-for="(material, index) in materials"
                      :key="material.id"
                      class="tag"
                    >
                      {{ t('teacher.materialItem', { index: format.number(index + 1) }) }}
                      <button
                        class="btn btn-sm btn-ghost"
                        type="button"
                        :aria-label="t('teacher.removeMaterial', { index: format.number(index + 1) })"
                        @click="removeMaterial(material.id)"
                      >
                        <X
                          :size="14"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  </ul>
                  <CameraCapture
                    v-if="materials.length < 5"
                    :application-id="open.id"
                    @captured="captured"
                  />
                </div>
                <fieldset class="stack-sm">
                  <legend class="field-label">
                    {{ t('teacher.disclosureLegend') }}
                  </legend>
                  <p class="field-hint">
                    {{ t('teacher.disclosureHint') }}
                  </p>
                  <label
                    v-for="item in teacherDisclosures"
                    :key="item"
                    class="check"
                  >
                    <input
                      v-model="form.disclosures"
                      type="checkbox"
                      :value="item"
                    >
                    <span>{{ t(`teacher.disclosure.${item}`) }}</span>
                  </label>
                </fieldset>
              </fieldset>
              <div class="form-actions">
                <button
                  class="btn btn-primary"
                  type="submit"
                  :disabled="!ready || task.busy.value"
                >
                  {{ t('teacher.submit') }}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section
          v-else
          class="section"
          aria-labelledby="teacher-start"
        >
          <h2
            id="teacher-start"
            class="d-title"
          >
            {{ t('teacher.start') }}
          </h2>
          <form
            class="card stack"
            novalidate
            @submit.prevent="start"
          >
            <p class="muted small">
              {{ t('teacher.startHint') }}
            </p>
            <fieldset
              class="stack-sm"
              :disabled="task.busy.value"
            >
              <legend class="field-label">
                {{ t('teacher.school') }}
              </legend>
              <label
                v-for="item in data.data.value.schools"
                :key="item.id"
                class="check"
              >
                <input
                  v-model="school"
                  type="radio"
                  :value="item.id"
                >
                <span>{{ item.name }}</span>
              </label>
            </fieldset>
            <label class="check">
              <input
                v-model="consent"
                type="checkbox"
                :disabled="task.busy.value"
              >
              <span>{{ t('teacher.consent') }}</span>
            </label>
            <div class="form-actions">
              <button
                class="btn btn-primary"
                type="submit"
                :disabled="!school || !consent || task.busy.value"
              >
                {{ t('teacher.apply') }}
              </button>
            </div>
          </form>
        </section>

        <section
          v-if="decided.length"
          class="section"
          aria-labelledby="teacher-history"
        >
          <h2
            id="teacher-history"
            class="d-title"
          >
            {{ t('teacher.history') }}
          </h2>
          <ul class="group">
            <li
              v-for="item in decided"
              :key="item.id"
              class="group-row"
            >
              <span class="group-body">
                <span class="group-title">{{ schoolName(item.school_id, data.data.value.schools) }}</span>
                <span class="group-detail">{{ format.dateTime(item.updated_at) }}<template v-if="item.review_note"> · {{ item.review_note }}</template></span>
              </span>
              <StatusTag :tone="appTone(item.state)">
                {{ t(`teacher.applicationState.${item.state}`) }}
              </StatusTag>
            </li>
          </ul>
        </section>
      </template>
    </AsyncState>
  </MeLayout>
</template>

<style scoped>
.check { display: flex; align-items: flex-start; gap: .5rem; }
.check input { margin-block-start: .25rem; }
</style>
