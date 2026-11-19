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
import VerificationRoles from './VerificationRoles.vue'
import { useAcademic } from '../academic/api'
import CameraCapture from './CameraCapture.vue'
import MaterialThumb from './MaterialThumb.vue'
import SchoolPicker from './SchoolPicker.vue'
import { verificationPages, teacherDisclosures, useVerification, type Application, type Material, type School, type TeacherCredential, type TeacherDisclosure } from './api'

// Teacher verification: the person applies with photographed evidence, an
// administrator reviews it and binds catalog teacher profiles. Each public
// attribute is shown only with the person's consent, and can be changed later.
const { t, te } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useVerification()
const academic = useAcademic()

const data = useAsync(async (signal) => {
  const [schools, applications, owned] = await Promise.all([
    verificationPages(after => api.list('School', '/api/v1/verification/schools', { limit: 100, after, signal })),
    verificationPages(after => api.list('Application', '/api/v1/verification/applications', { limit: 100, after, signal })),
    verificationPages(after => api.list('TeacherCredential', '/api/v1/verification/teacher-credentials', { limit: 100, after, signal })),
  ])
  const teacherApps = applications.items.filter((item) => item.kind === 'teacher').sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const ids = owned.items.flatMap((item) => item.teacher_ids)
  const names = ids.length ? await academic.lookup(ids, signal).catch(() => new Map<string, { name: string }>()) : new Map<string, { name: string }>()
  return { schools: schools.items.filter((item) => item.enabled), applications: teacherApps, credentials: owned.items, names }
})
void data.reload()
const restarting = ref(false)
const selectedDraft = shallowRef<Application>()
const open = computed(() => {
  const apps = data.data.value?.applications ?? []
  for (const state of ['pending_review', 'supplement_required', 'in_progress'] as const) {
    const candidates = apps.filter((item) => item.state === state)
    const selected = selectedDraft.value
    if (state === 'in_progress' && selected) {
      const current = apps.find(item => item.id === selected.id)
      if (!current || current.state === state) return current ?? selected
    }
    const match = candidates.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id))[0]
    if (match) return match
  }
  return undefined
})
const decided = computed(() => data.data.value?.applications.filter((item) => item !== open.value) ?? [])
const searchedSchools = ref<School[]>([])
const knownSchools = computed(() => [...new Map([...(data.data.value?.schools ?? []), ...searchedSchools.value].map((item) => [item.id, item])).values()])
const schoolOf = (id: string) => knownSchools.value.find((item) => item.id === id)
const appTone = (state: Application['state']) => (state === 'approved' ? 'success' : state === 'rejected' || state === 'expired' ? 'danger' : state === 'supplement_required' ? 'warning' : 'info')

// Starting an application requires choosing the school and accepting its notice.
const task = useTask()
const school = ref('')
function chooseSchool(item: School) {
  searchedSchools.value = [...new Map([...searchedSchools.value, item].map((row) => [row.id, row])).values()]
  school.value = item.id
}
const consent = ref(false)
function restartSchool() {
  restarting.value = true
  school.value = ''
  consent.value = false
}
async function start() {
  const chosen = schoolOf(school.value)
  if (!chosen?.teacher_enabled || !consent.value) return
  const created = await task.run(() => api.write('Application', '/api/v1/verification/teacher-applications', { school_id: chosen.id, notice_version: chosen.notice_version, consent: true }))
  if (created) {
    selectedDraft.value = created
    restarting.value = false
    consent.value = false
    await data.reload()
    if (open.value?.id === created.id) await loadForm(open.value)
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
  if (formFor.value === application.id || task.busy.value) return
  const path = `/api/v1/verification/applications/${encodeURIComponent(application.id)}`
  const loaded = await task.run(async () => {
    const [evidence, saved] = await Promise.all([
      api.list('Material', `${path}/materials`),
      api.get('TeacherForm', `${path}/teacher-form`).catch(failure => {
        if (errorCode(failure) !== 'not_found') throw failure
        return undefined
      }),
    ])
    return { evidence, saved }
  })
  if (!loaded || open.value?.id !== application.id) return
  const { evidence, saved } = loaded
  materials.value = evidence.items
  Object.assign(form, {
    name: saved?.name ?? '', organization: saved?.organization ?? '', gender: saved?.gender ?? '',
    email: saved?.email ?? '', material_type: saved?.material_type || schoolOf(application.school_id)?.teacher_material_types?.[0] || '',
    disclosures: saved ? [...saved.disclosures] : ['teacher'],
  })
  formFor.value = application.id
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
  if (!materials.value.some((item) => item.id === material.id)) {
    materials.value = [...materials.value, material]
  }
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
    :title="t('verification.unified.title')"
    :description="t('teacher.description')"
  >
    <VerificationRoles role="teacher" />
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
          v-if="open && !restarting"
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
              <div class="row">
                <StatusTag :tone="appTone(open.state)">
                  {{ t(`teacher.applicationState.${open.state}`) }}
                </StatusTag>
                <button
                  v-if="open.state === 'in_progress'"
                  class="btn btn-sm btn-ghost"
                  type="button"
                  :disabled="task.busy.value"
                  @click="restartSchool"
                >
                  {{ t('verification.changeSchool') }}
                </button>
              </div>
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
              :disabled="task.busy.value"
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
                    v-for="type in schoolOf(open.school_id)?.teacher_material_types ?? []"
                    :key="type"
                    class="check"
                  >
                    <input
                      v-model="form.material_type"
                      name="teacher-material-type"
                      type="radio"
                      :value="type"
                    >
                    <span>{{ te(`verification.materialTypes.${type}`) ? t(`verification.materialTypes.${type}`) : type }}</span>
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
                      <MaterialThumb
                        :material="material"
                        :alt="t('teacher.materialItem', { index: format.number(index + 1) })"
                      />
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
                    :key="open.id"
                    :application-id="open.id"
                    :existing-ids="materials.map((item) => item.id)"
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
            <SchoolPicker
              :model-value="school"
              :schools="knownSchools"
              :disabled="task.busy.value"
              @select="chooseSchool"
            />
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
                :disabled="!schoolOf(school)?.teacher_enabled || !consent || task.busy.value"
              >
                {{ t('teacher.apply') }}
              </button>
              <button
                v-if="open"
                class="btn btn-ghost"
                type="button"
                :disabled="task.busy.value"
                @click="restarting = false"
              >
                {{ t('common.cancel') }}
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
