<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
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
import { readyStates, finishedStates, type MediaVersion, localName, typeLabel, Upload, useResourcesApi, type Metadata, type Resource } from './api'
import { useCampusId } from '../account/access'
import CatalogPicker from './CatalogPicker.vue'
import DirectoryPicker from './DirectoryPicker.vue'
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
const campus = useCampusId()
const router = useRouter()
const api = useResourcesApi()
const saving = useMutation()
const attaching = useMutation()
const submitting = useMutation()
const entry = shallowRef<Resource>()
const tagText = ref('')
const tags = computed(() => tagText.value.split(/[,，]/u).map(tag => tag.trim()).filter(Boolean))
const tagsInvalid = computed(() => tags.value.length > 20 || tags.value.some(tag => [...tag].length > 64))
const consent = ref(false)
const file = shallowRef<File>()
const uploadState = ref('')
const uploadError = ref('')
const uploadBusy = ref(false)
const uploadedBytes = ref(0)
const uploadTotalBytes = ref(0)
const dragging = ref(false)
const cancelling = ref(false)
const reused = ref(false)
const submitted = ref(false)
let upload: Upload | undefined
let uploadAttempt = 0

function initialDirectory() {
  if (props.id) return undefined
  const stateDir: unknown = typeof window !== 'undefined' && typeof window.history.state === 'object' && window.history.state !== null ? (window.history.state as Record<string, unknown>).directory_id : undefined
  const raw = typeof stateDir === 'string' && stateDir ? stateDir : typeof route.query.directory_id === 'string' ? route.query.directory_id : ''
  return raw && raw.length <= 128 ? raw : undefined
}

const metadata = ref<Metadata>({
  title: '',
  description: '',
  tags: [],
  category_id: '',
  category_revision: 1,
  attributes: {},
  associations: { school_id: campus.value, course_id: typeof route.query.course_id === 'string' ? route.query.course_id : '' },
  directory_id: initialDirectory(),
  access: 'public',
  origin: { kind: 'unknown' },
})

const setup = useAsync(async (signal) => {
  const [capabilities, listed, item] = await Promise.all([
    api.capabilities(signal),
    api.categories(signal).catch(failure => {
      if (props.id && failure instanceof ApiError && failure.status === 403) return undefined
      throw failure
    }),
    props.id ? api.item(props.id, signal) : undefined,
  ])
  const version = item?.proposal ?? item?.current
  // An owner may read the category stored with their version after directory access expires.
  const categories = listed ?? (item?.owned && version ? [version.category] : undefined)
  if (!categories) throw new ApiError('forbidden', false, 403)
  entry.value = item
  if (version) {
    metadata.value = snapshot(version.metadata)
    tagText.value = version.metadata.tags.join(', ')
    consent.value = version.metadata.origin.consent?.accepted ?? false
  }
  if (!metadata.value.category_id) metadata.value.category_id = categories[0]?.id ?? ''
  await nextTick()
  baseline.value = fingerprint()
  return { capabilities, categories, canBrowse: listed !== undefined }
})

const capabilities = computed(() => setup.data.value?.capabilities)
const category = computed(() => setup.data.value?.categories.find((item) => item.id === metadata.value.category_id))
const profile = computed(() => capabilities.value?.upload_profiles.find((item) => item.school_id === metadata.value.associations.school_id && item.access === metadata.value.access))
const fingerprint = () => JSON.stringify([metadata.value, tagText.value, consent.value])
const baseline = ref('')
const dirty = computed(() => baseline.value !== '' && fingerprint() !== baseline.value)
const proposal = computed(() => entry.value?.proposal)
const step = computed(() => (!proposal.value || dirty.value ? 1 : !proposal.value?.file ? 2 : 3))
// 一次只显示当前步骤。上传完成后文件状态仍和提交审核一起显示。已完成的步骤可以点回去修改。
const viewStep = ref(step.value)
watch(step, (value) => { viewStep.value = value })
watch(() => metadata.value.associations.course_id, (next, previous) => {
  if (baseline.value !== '' && next !== previous) metadata.value.directory_id = undefined
})
const fileDisabled = computed(() => !entry.value || dirty.value || anyBusy.value || anyUncertain.value || (!!upload && !attaching.error.value && !!uploadState.value && uploadState.value !== 'attached'))
const canSubmit = computed(() => !!proposal.value?.file && !dirty.value && !['pending', 'preparing'].includes(proposal.value.state))
const anyBusy = computed(() => saving.busy.value || attaching.busy.value || submitting.busy.value || uploadBusy.value || cancelling.value)
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
  if (!current || !terms || tagsInvalid.value) return
  const body = snapshot(metadata.value)
  body.category_revision = current.revision
  body.tags = tags.value
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

function pickFile(chosen: File | undefined) {
  attaching.dismiss()
  file.value = chosen
  upload = undefined
  uploadState.value = ''
  uploadError.value = ''
  uploadedBytes.value = 0
  uploadTotalBytes.value = 0
  reused.value = false
}

function chooseFile(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  pickFile(event.target.files?.[0])
}

function dropFile(event: DragEvent) {
  dragging.value = false
  if (fileDisabled.value) return
  const dropped = event.dataTransfer?.files?.[0]
  if (dropped) pickFile(dropped)
}

async function sendFile() {
  const chosen = file.value
  const limits = capabilities.value
  const purpose = profile.value?.purpose
  const current = entry.value
  if (!chosen || !limits || !purpose || !current || dirty.value || uploadBusy.value || cancelling.value) return
  uploadError.value = ''
  if (!chosen.size || chosen.size > limits.max_file_size || !limits.allowed_types.includes(chosen.type || 'application/octet-stream')) {
    uploadError.value = 'file_not_allowed'
    return
  }
  const attempt = ++uploadAttempt
  uploadBusy.value = true
  uploadedBytes.value = 0
  uploadTotalBytes.value = chosen.size
  try {
    if (!upload || upload.purpose !== purpose) upload = new Upload(api, chosen, purpose)
    const version = await upload.run((loaded, total) => {
      uploadedBytes.value = loaded
      uploadTotalBytes.value = total
    })
    if (attempt === uploadAttempt) await applyUpload(version)
  } catch (failure) {
    if (attempt !== uploadAttempt || errorCode(failure) === 'cancelled') return
    uploadError.value = errorCode(failure)
    // A lost response keeps the session; the next attempt resumes it.
    if (!isUncertain(failure) && !(failure instanceof ApiError && failure.code === 'reuse_pending')) upload = undefined
  } finally {
    uploadBusy.value = false
  }
}

async function applyUpload(version: MediaVersion) {
  uploadError.value = ''
  uploadState.value = version.state
  reused.value = version.reused === true
  if (readyStates.includes(version.state)) await attach(version.id)
  else if (finishedStates.includes(version.state)) {
    file.value = undefined
    upload = undefined
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
  if (cancelling.value || attaching.busy.value || attaching.uncertain.value) return
  if (!upload) {
    uploadState.value = ''
    uploadError.value = ''
    file.value = undefined
    return
  }
  uploadError.value = ''
  // A known session now belongs to the cancellation; ignore late content responses.
  if (upload.version) uploadAttempt++
  cancelling.value = true
  try {
    await applyUpload(await upload.cancel())
  } catch (error) {
    if (error instanceof ApiError && error.code === 'cancelled' && !error.uncertain) {
      uploadAttempt++
      file.value = undefined
      upload = undefined
      uploadState.value = ''
      return
    }
    // Show "cancelling" until the server confirms; a network error is not a cancellation.
    uploadError.value = 'cancel_pending'
  } finally {
    cancelling.value = false
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
      back="/resources"
      :back-label="t('nav.resources')"
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
        class="stack"
      >
        <ol class="stepper">
          <li
            v-for="n in 3"
            :key="n"
          >
            <button
              class="stepper-item"
              type="button"
              :aria-current="viewStep === n ? 'step' : undefined"
              :data-done="n < step || undefined"
              :disabled="n > step"
              @click="viewStep = n"
            >
              {{ t(`resources.editor.step${n}`) }}
            </button>
          </li>
        </ol>
        <MutationNotice
          :busy="saving.busy.value"
          :error="saving.error.value"
          :uncertain="saving.uncertain.value"
          :success="entry && !dirty && !saving.error.value ? t('resources.editor.saved') : ''"
          @retry="retrySave"
        />
        <form
          v-show="viewStep === 1"
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
                <AppSelect
                  v-model="metadata.category_id"
                  :disabled="!setup.data.value.canBrowse"
                  class="select"
                  required
                  @change="changeCategory"
                >
                  <option
                    v-for="item in setup.data.value.categories"
                    :key="item.id"
                    :value="item.id"
                  >{{ localName(item.names, locale) }}</option>
                </AppSelect>
                <span
                  v-if="!category"
                  class="field-error"
                  role="alert"
                >{{ t('resources.editor.selectCategory') }}</span>
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
                    :aria-invalid="tagsInvalid"
                  >
                </label>
                <span class="field-hint">{{ t('resources.editor.tagsHint') }}</span>
                <span
                  v-if="tagsInvalid"
                  class="field-error"
                  role="alert"
                >{{ t('resources.editor.tagLimits') }}</span>
              </div>
              <label class="field">
                <span class="field-label">{{ t('resources.detail.access') }}</span>
                <AppSelect
                  v-model="metadata.access"
                  class="select"
                >
                  <option value="public">{{ t('resources.accessLevel.public') }}</option>
                  <option value="restricted">{{ t('resources.accessLevel.restricted') }}</option>
                </AppSelect>
              </label>
            </div>

            <fieldset
              v-if="setup.data.value.canBrowse"
              class="stack-sm"
            >
              <legend>{{ t('resources.editor.associations') }}</legend>
              <p class="field-hint">
                {{ t('resources.editor.associationsHint') }}
              </p>
              <div class="form-grid">
                <CatalogPicker
                  v-model="metadata.associations.course_id"
                  kind="course"
                  :label="t('academic.course')"
                  :school="metadata.associations.school_id || undefined"
                />
                <CatalogPicker
                  v-model="metadata.associations.term_id"
                  kind="term"
                  :label="t('academic.editor.term')"
                  :school="metadata.associations.school_id || undefined"
                />
                <CatalogPicker
                  v-model="metadata.associations.teacher_id"
                  kind="teacher"
                  :label="t('academic.teacher')"
                  :school="metadata.associations.school_id || undefined"
                  :course="metadata.associations.course_id || undefined"
                />
                <DirectoryPicker
                  v-model="metadata.directory_id"
                  :school="metadata.associations.school_id || undefined"
                  :course="metadata.associations.course_id || undefined"
                  :disabled="saving.busy.value || saving.uncertain.value"
                />
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
          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              :disabled="tagsInvalid || !category || anyBusy || anyUncertain || (!dirty && !!proposal)"
            >
              {{ t(entry ? 'resources.editor.saveChanges' : 'resources.editor.create') }}
            </button>
          </div>
        </form>

        <aside class="stack">
          <section
            v-show="viewStep >= 2"
            class="card stack"
          >
            <h2>{{ t('resources.editor.step2') }}</h2>
            <p class="small muted">
              {{ t('resources.editor.limits', { size: format.bytes(capabilities.max_file_size), types: format.list(capabilities.allowed_types.map(typeLabel)) }) }}
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
            <label
              class="field app-file dropzone"
              :data-dragging="dragging || undefined"
              @dragenter.prevent="!fileDisabled && (dragging = true)"
              @dragover.prevent="!fileDisabled && (dragging = true)"
              @dragleave.prevent="dragging = false"
              @drop.prevent="dropFile"
            >
              <span class="field-label">{{ t('resources.editor.chooseFile') }}</span>
              <input
                class="app-file-input"
                :aria-label="t('resources.editor.chooseFile')"
                type="file"
                :accept="capabilities.allowed_types.join(',')"
                :disabled="fileDisabled"
                @change="chooseFile"
              >
              <span class="app-file-row"><span class="btn btn-sm">{{ t('resources.editor.browseFile') }}</span><span class="subtle truncate">{{ file?.name ?? t('resources.editor.dropOrBrowse') }}</span></span>
            </label>
            <div
              v-if="uploadBusy && uploadTotalBytes > 0"
              class="stack-sm"
              role="status"
            >
              <progress
                class="upload-progress"
                :value="uploadedBytes"
                :max="uploadTotalBytes"
              />
              <span class="subtle">{{ t('resources.editor.uploadProgress', { loaded: format.bytes(uploadedBytes), total: format.bytes(uploadTotalBytes), percent: format.percent(uploadedBytes / uploadTotalBytes) }) }}</span>
            </div>
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
                :disabled="cancelling || attaching.busy.value || attaching.uncertain.value"
                @click="cancelUpload"
              >
                {{ t('resources.editor.cancelUpload') }}
              </button>
            </div>
          </section>

          <section
            v-show="viewStep === 3"
            class="card stack"
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
.stepper { display: flex; flex-wrap: wrap; gap: .375rem; }
.stepper-item { min-height: 36px; padding: .25rem .875rem; border: 0; border-radius: var(--pill); background: var(--fill); color: var(--label-2); font: inherit; font-size: .875rem; cursor: pointer; }
.stepper-item[aria-current="step"] { background: var(--accent-fill); color: var(--on-accent); font-weight: 550; }
.stepper-item[data-done]::before { content: "✓ "; color: var(--c-green); }
.stepper-item:disabled { opacity: .5; cursor: default; }
.origin-choice { justify-content: flex-start; gap: .5rem; padding: .375rem .875rem; border-radius: var(--pill); background: var(--fill); }
.origin-choice > span { order: 0; padding: 0; }
.dropzone[data-dragging] .app-file-row { outline: 2px dashed var(--accent); background: var(--accent-soft); }
.upload-progress { width: 100%; height: .5rem; accent-color: var(--accent-fill); }
.layout-aside > aside { position: sticky; inset-block-start: calc(var(--nav-height) + 1.5rem); }
@media (max-width: 960px) { .layout-aside > aside { position: static; } }
</style>
