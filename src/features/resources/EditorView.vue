<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { ApiError, errorCode, isUncertain } from '../../shared/api/errors'
import { snapshot } from '../../shared/api/mutation'
import { useAsync, useMutation } from '../../shared/composables/async'
import { useLeaveGuard } from '../../shared/composables/leave'
import AsyncState from '../../shared/ui/AsyncState.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useErrorText } from '../../shared/ui/messages'
import { localName, Upload, useResourcesApi, type Metadata, type Resource } from './api'
import CatalogPicker from './CatalogPicker.vue'
import FieldInput from './FieldInput.vue'

/**
 * Create or correct a resource in three steps: save the description, transfer
 * the file, submit for review. Each step reports its own result; a published
 * version stays available while a correction or new file waits for review.
 */
const props = withDefaults(defineProps<{ id?: string }>(), { id: undefined })
const { t, locale } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const route = useRoute()
const router = useRouter()
const api = useResourcesApi()
const saving = useMutation()
const attaching = useMutation()
const submitting = useMutation()
const entry = shallowRef<Resource>()
const tagText = ref('')
const consent = ref(false)
const file = shallowRef<File>()
const uploadState = ref('')
const uploadError = ref('')
const uploadBusy = ref(false)
const reused = ref(false)
const submitted = ref(false)
let upload: Upload | undefined

const metadata = ref<Metadata>({
  title: '',
  description: '',
  tags: [],
  category_id: '',
  category_revision: 1,
  attributes: {},
  associations: { school_id: typeof route.query.school_id === 'string' ? route.query.school_id : '', course_id: typeof route.query.course_id === 'string' ? route.query.course_id : '' },
  access: 'public',
  origin: { kind: 'unknown' },
})

const setup = useAsync(async (signal) => {
  const [capabilities, categories] = await Promise.all([api.capabilities(signal), api.categories(signal)])
  if (props.id) {
    entry.value = await api.item(props.id, signal)
    const version = entry.value.proposal ?? entry.value.current
    if (version) {
      metadata.value = snapshot(version.metadata)
      tagText.value = version.metadata.tags.join(', ')
      consent.value = version.metadata.origin.consent?.accepted ?? false
    }
  }
  if (!metadata.value.category_id) metadata.value.category_id = categories[0]?.id ?? ''
  await nextTick()
  baseline.value = fingerprint()
  return { capabilities, categories }
})

const capabilities = computed(() => setup.data.value?.capabilities)
const category = computed(() => setup.data.value?.categories.find((item) => item.id === metadata.value.category_id))
const profile = computed(() => capabilities.value?.upload_profiles.find((item) => item.school_id === metadata.value.associations.school_id && item.access === metadata.value.access))
const fingerprint = () => JSON.stringify([metadata.value, tagText.value, consent.value])
const baseline = ref('')
const dirty = computed(() => baseline.value !== '' && fingerprint() !== baseline.value)
const proposal = computed(() => entry.value?.proposal)
const step = computed(() => (!entry.value || dirty.value ? 1 : !proposal.value?.file ? 2 : 3))
const canSubmit = computed(() => !!proposal.value?.file && !dirty.value && !['pending', 'preparing'].includes(proposal.value.state))
const anyBusy = computed(() => saving.busy.value || attaching.busy.value || submitting.busy.value || uploadBusy.value)
const anyUncertain = computed(() => saving.uncertain.value || attaching.uncertain.value || submitting.uncertain.value)

useLeaveGuard(() => (anyUncertain.value ? t('common.leaveUncertain') : dirty.value || anyBusy.value ? t('common.leaveUnsaved') : ''))
onMounted(setup.reload)

function changeCategory() {
  metadata.value.attributes = {}
  metadata.value.category_revision = category.value?.revision ?? 1
}

async function save() {
  const current = category.value
  const terms = capabilities.value?.terms
  if (!current || !terms) return
  const body = snapshot(metadata.value)
  body.category_revision = current.revision
  body.tags = tagText.value.split(',').map((tag) => tag.trim()).filter(Boolean)
  if (body.origin.kind === 'original') body.origin.consent = { accepted: consent.value, version: terms.version, digest: terms.digest }
  else delete body.origin.consent
  const id = entry.value?.id
  const write = { revision: entry.value?.revision ?? 0, metadata: body }
  const result = await saving.run(id ? `update:${id}` : 'create', write, (value, key) => (id ? api.updateDraft(id, value, key) : api.createDraft(value, key)))
  if (result) saved(result)
}
async function retrySave() {
  const result = await saving.retry()
  // The retried write is the original create or update of this resource.
  if (result) saved(result as Resource)
}
function saved(result: Resource) {
  entry.value = result
  baseline.value = fingerprint()
  if (!props.id) void router.replace(`/resources/items/${encodeURIComponent(result.id)}/edit`)
}

function chooseFile(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  file.value = event.target.files?.[0]
  upload = undefined
  uploadState.value = ''
  uploadError.value = ''
  reused.value = false
}

async function sendFile() {
  const chosen = file.value
  const limits = capabilities.value
  const purpose = profile.value?.purpose
  const current = entry.value
  if (!chosen || !limits || !purpose || !current || dirty.value || uploadBusy.value) return
  uploadError.value = ''
  if (chosen.size > limits.max_file_size || !limits.allowed_types.includes(chosen.type || 'application/octet-stream')) {
    uploadError.value = 'file_not_allowed'
    return
  }
  uploadBusy.value = true
  try {
    upload ??= new Upload(api, chosen, purpose)
    const version = await upload.run()
    uploadState.value = version.state
    reused.value = version.reused === true
    if (['awaiting_approval', 'approved'].includes(version.state)) await attach(version.id)
  } catch (failure) {
    uploadError.value = errorCode(failure)
    // A lost response keeps the session; the next attempt resumes it.
    if (!isUncertain(failure) && !(failure instanceof ApiError && failure.code === 'reuse_pending')) upload = undefined
  } finally {
    uploadBusy.value = false
  }
}

async function attach(mediaVersion: string) {
  const current = entry.value
  if (!current) return
  const result = await attaching.run(`attach:${current.id}`, { revision: current.revision, media_version_id: mediaVersion }, (value, key) => api.attachFile(current.id, value, key))
  if (result) attached(result)
}
async function retryAttach() {
  const result = await attaching.retry()
  if (result) attached(result as Resource)
}
function attached(result: Resource) {
  entry.value = result
  uploadState.value = 'attached'
  file.value = undefined
  upload = undefined
}

async function cancelUpload() {
  if (!upload) {
    file.value = undefined
    return
  }
  uploadError.value = ''
  try {
    const version = await upload.cancel()
    uploadState.value = version.state
    if (version.state === 'cancelled') {
      file.value = undefined
      upload = undefined
    }
  } catch {
    // Show "cancelling" until the server confirms; a network error is not a cancellation.
    uploadError.value = 'cancel_pending'
  }
}

async function submit() {
  const current = entry.value
  if (!current) return
  const result = await submitting.run(`submit:${current.id}`, { revision: current.revision }, (value, key) => api.submit(current.id, value, key))
  if (result) {
    entry.value = result
    submitted.value = true
  }
}
async function retrySubmit() {
  const result = await submitting.retry()
  if (result) {
    entry.value = result as Resource
    submitted.value = true
  }
}

function uploadMessage(state: string) {
  return ['created', 'uploading', 'verifying', 'awaiting_approval', 'approved', 'ready', 'cancelled', 'expired', 'rejected', 'attached'].includes(state) ? t(`resources.editor.uploadState.${state}`) : t('resources.editor.uploadState.processing')
}
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :eyebrow="t('nav.resources')"
      :title="t(id ? 'resources.edit' : 'resources.upload')"
      :description="t('resources.editor.intro')"
    >
      <template #actions>
        <RouterLink
          class="btn"
          to="/me/resources"
        >
          {{ t('me.resources') }}
        </RouterLink>
      </template>
    </PageHeader>

    <AsyncState
      :status="setup.status.value"
      :error="setup.error.value"
      @retry="setup.reload"
    >
      <div
        v-if="setup.data.value && capabilities"
        class="layout-aside"
      >
        <form
          class="card stack"
          @submit.prevent="save"
        >
          <header class="row-between">
            <h2>{{ t('resources.editor.step1') }}</h2>
            <StatusTag :tone="entry && !dirty ? 'success' : 'neutral'">
              {{ t(entry && !dirty ? 'resources.editor.savedState' : dirty || !entry ? 'resources.editor.unsavedState' : 'resources.editor.savedState') }}
            </StatusTag>
          </header>
          <fieldset
            class="stack"
            :disabled="saving.busy.value || saving.uncertain.value"
          >
            <label class="field">
              <span class="field-label">{{ t('resources.editor.title') }}</span>
              <input
                v-model="metadata.title"
                class="input"
                required
                maxlength="200"
              >
            </label>
            <label class="field">
              <span class="field-label">{{ t('resources.editor.description') }}</span>
              <textarea
                v-model="metadata.description"
                class="textarea"
                maxlength="8000"
              />
            </label>
            <div class="form-grid">
              <label class="field">
                <span class="field-label">{{ t('resources.category') }}</span>
                <select
                  v-model="metadata.category_id"
                  class="select"
                  required
                  @change="changeCategory"
                >
                  <option
                    v-for="item in setup.data.value.categories"
                    :key="item.id"
                    :value="item.id"
                  >{{ localName(item.names, locale) }}</option>
                </select>
              </label>
              <FieldInput
                v-for="field in category?.fields"
                :key="field.key"
                v-model="metadata.attributes[field.key]"
                :field="field"
              />
              <div class="field">
                <label class="field">
                  <span class="field-label">{{ t('resources.editor.tags') }}</span>
                  <input
                    v-model="tagText"
                    class="input"
                    maxlength="1000"
                  >
                </label>
                <span class="field-hint">{{ t('resources.editor.tagsHint') }}</span>
              </div>
              <label class="field">
                <span class="field-label">{{ t('resources.detail.access') }}</span>
                <select
                  v-model="metadata.access"
                  class="select"
                >
                  <option value="public">{{ t('resources.accessLevel.public') }}</option>
                  <option value="restricted">{{ t('resources.accessLevel.restricted') }}</option>
                </select>
              </label>
            </div>

            <fieldset class="stack-sm">
              <legend>{{ t('resources.editor.associations') }}</legend>
              <p class="field-hint">
                {{ t('resources.editor.associationsHint') }}
              </p>
              <div class="form-grid">
                <CatalogPicker
                  v-model="metadata.associations.school_id"
                  kind="school"
                  :label="t('academic.directory.school')"
                  :disabled="!!entry"
                />
                <CatalogPicker
                  v-model="metadata.associations.course_id"
                  kind="course"
                  :label="t('academic.course')"
                  :school="metadata.associations.school_id || undefined"
                  :disabled="!metadata.associations.school_id"
                />
                <CatalogPicker
                  v-model="metadata.associations.term_id"
                  kind="term"
                  :label="t('academic.editor.term')"
                  :school="metadata.associations.school_id || undefined"
                  :disabled="!metadata.associations.school_id"
                />
                <CatalogPicker
                  v-model="metadata.associations.offering_id"
                  kind="term_course"
                  :label="t('academic.offering')"
                  :school="metadata.associations.school_id || undefined"
                  :course="metadata.associations.course_id || undefined"
                  :term="metadata.associations.term_id || undefined"
                  :disabled="!metadata.associations.course_id"
                />
                <CatalogPicker
                  v-model="metadata.associations.teacher_id"
                  kind="teacher"
                  :label="t('academic.teacher')"
                  :school="metadata.associations.school_id || undefined"
                  :course="metadata.associations.course_id || undefined"
                  :disabled="!metadata.associations.school_id"
                />
                <div class="field">
                  <label class="field">
                    <span class="field-label">{{ t('resources.editor.directory') }}</span>
                    <input
                      v-model="metadata.directory_id"
                      class="input"
                      maxlength="128"
                    >
                  </label>
                  <span class="field-hint">{{ t('resources.editor.directoryHint') }}</span>
                </div>
              </div>
            </fieldset>

            <fieldset class="stack-sm">
              <legend>{{ t('resources.origin.label') }}</legend>
              <div
                class="row"
                role="radiogroup"
                :aria-label="t('resources.origin.label')"
              >
                <label
                  v-for="kind in ['original', 'known', 'unknown'] as const"
                  :key="kind"
                  class="check origin-choice"
                >
                  <input
                    v-model="metadata.origin.kind"
                    type="radio"
                    name="origin"
                    :value="kind"
                  >
                  <span>{{ t(`resources.origin.kinds.${kind}`) }}</span>
                </label>
              </div>
              <label
                v-if="metadata.origin.kind === 'known'"
                class="field"
              >
                <span class="field-label">{{ t('resources.origin.source') }}</span>
                <input
                  v-model="metadata.origin.source"
                  class="input"
                  required
                  maxlength="2000"
                  :placeholder="t('resources.origin.sourcePlaceholder')"
                >
              </label>
              <p
                v-if="metadata.origin.kind === 'unknown'"
                class="field-hint"
              >
                {{ t('resources.origin.unknownHint') }}
              </p>
              <div
                v-if="metadata.origin.kind !== 'original'"
                class="form-grid"
              >
                <label class="field">
                  <span class="field-label">{{ t('resources.origin.author') }}</span>
                  <input
                    v-model="metadata.origin.author"
                    class="input"
                    maxlength="200"
                  >
                </label>
                <label class="field">
                  <span class="field-label">{{ t('resources.origin.license') }}</span>
                  <input
                    v-model="metadata.origin.license"
                    class="input"
                    maxlength="4000"
                  >
                </label>
              </div>
              <div
                v-if="metadata.origin.kind === 'original'"
                class="notice notice-info stack-sm"
              >
                <p class="small">
                  {{ t('resources.origin.consentNotice') }}
                </p>
                <a
                  :href="capabilities.terms.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ t('resources.origin.terms') }}</a>
                <label class="check">
                  <input
                    v-model="consent"
                    type="checkbox"
                    required
                  >
                  <span>{{ t('resources.origin.accept') }}</span>
                </label>
              </div>
            </fieldset>
          </fieldset>
          <MutationNotice
            :busy="saving.busy.value"
            :error="saving.error.value"
            :uncertain="saving.uncertain.value"
            :success="entry && !dirty && !saving.error.value ? t('resources.editor.saved') : ''"
            @retry="retrySave"
          />
          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              :disabled="saving.busy.value || saving.uncertain.value || (!dirty && !!entry)"
            >
              {{ t(entry ? 'resources.editor.saveChanges' : 'resources.editor.create') }}
            </button>
          </div>
        </form>

        <aside class="stack">
          <section
            class="card stack"
            :class="{ dim: step < 2 }"
          >
            <h2>{{ t('resources.editor.step2') }}</h2>
            <p class="small muted">
              {{ t('resources.editor.limits', { size: format.bytes(capabilities.max_file_size), types: format.list(capabilities.allowed_types) }) }}
            </p>
            <p
              v-if="!profile"
              class="notice notice-warning small"
            >
              {{ t('resources.editor.noProfile') }}
            </p>
            <p
              v-if="proposal?.file"
              class="small"
            >
              {{ t('resources.editor.currentFile', { name: proposal.file.filename, size: format.bytes(proposal.file.size) }) }}
            </p>
            <label class="field">
              <span class="field-label">{{ t('resources.editor.chooseFile') }}</span>
              <input
                type="file"
                :accept="capabilities.allowed_types.join(',')"
                :disabled="!entry || dirty || uploadBusy || (!!uploadState && !['cancelled', 'attached'].includes(uploadState))"
                @change="chooseFile"
              >
            </label>
            <p
              v-if="dirty || !entry"
              class="field-hint"
            >
              {{ t('resources.editor.saveFirst') }}
            </p>
            <p
              v-if="uploadState"
              class="small"
              role="status"
            >
              {{ uploadMessage(uploadState) }}
            </p>
            <p
              v-if="reused"
              class="small notice notice-info"
            >
              {{ t('resources.editor.reused') }}
            </p>
            <p
              v-if="uploadError"
              class="notice notice-error small"
              role="alert"
            >
              {{ uploadError === 'file_not_allowed' ? t('resources.editor.fileNotAllowed') : uploadError === 'reuse_pending' ? t('resources.editor.reusePending') : uploadError === 'cancel_pending' ? t('resources.editor.cancelPending') : errorText(uploadError) }}
            </p>
            <MutationNotice
              :busy="attaching.busy.value"
              :error="attaching.error.value"
              :uncertain="attaching.uncertain.value"
              @retry="retryAttach"
            />
            <div class="row">
              <button
                class="btn btn-primary"
                type="button"
                :disabled="uploadBusy || attaching.busy.value || attaching.uncertain.value || !file || !entry || dirty || !profile"
                @click="sendFile"
              >
                {{ t(uploadError || uploadState ? 'common.retry' : 'resources.editor.send') }}
              </button>
              <button
                v-if="file"
                class="btn"
                type="button"
                @click="cancelUpload"
              >
                {{ t('resources.editor.cancelUpload') }}
              </button>
            </div>
          </section>

          <section
            class="card stack"
            :class="{ dim: step < 3 }"
          >
            <h2>{{ t('resources.editor.step3') }}</h2>
            <p class="small muted">
              {{ t('resources.editor.reviewNotice') }}
            </p>
            <p
              v-if="proposal"
              class="row small"
            >
              <span>{{ t('resources.editor.proposalState') }}</span>
              <StatusTag :tone="proposal.state === 'published' || proposal.state === 'approved' ? 'success' : proposal.state === 'rejected' || proposal.state === 'blocked' ? 'danger' : 'warning'">
                {{ t(`resources.versionState.${proposal.state}`) }}
              </StatusTag>
            </p>
            <MutationNotice
              :busy="submitting.busy.value"
              :error="submitting.error.value"
              :uncertain="submitting.uncertain.value"
              :success="submitted ? t('resources.editor.submitted') : ''"
              @retry="retrySubmit"
            />
            <div class="row">
              <button
                class="btn btn-primary"
                type="button"
                :disabled="submitting.busy.value || submitting.uncertain.value || !canSubmit"
                @click="submit"
              >
                {{ t('resources.editor.submit') }}
              </button>
              <RouterLink
                v-if="entry"
                class="btn btn-ghost"
                :to="`/resources/items/${encodeURIComponent(entry.id)}`"
              >
                {{ t('resources.editor.view') }}
              </RouterLink>
            </div>
          </section>
        </aside>
      </div>
    </AsyncState>
  </div>
</template>

<style scoped>
.dim { opacity: .7; }
.origin-choice { padding: .35rem .7rem; border: 1px solid var(--border-strong); border-radius: 999px; }
</style>
