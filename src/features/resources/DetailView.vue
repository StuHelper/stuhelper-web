<script setup lang="ts">
import { Eye, Maximize2 } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useTask } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { rememberPage } from '../../shared/recent'
import { useErrorText } from '../../shared/ui/messages'
import { feature, useCapabilities } from '../../shared/capabilities'
import { attributeText, localName, maxPreviewBytes, previewKind, typeLabel, useResourcesApi } from './api'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import RequestForm from './RequestForm.vue'
import UnlockPanel from './UnlockPanel.vue'

const props = defineProps<{ id: string }>()
const { t, te, locale } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useResourcesApi()
const capabilities = useCapabilities()
const download = useTask()
const requesting = ref(false)
const entry = useAsync((signal) => api.item(props.id, signal))
// Users see the published version; a pending new version does not replace it until approved.
const version = computed(() => entry.data.value?.current ?? entry.data.value?.proposal)
const entryValue = computed(() => entry.data.value)

const previewOpen = ref(false)
const previewFullscreen = ref(false)
const previewBusy = ref(false)
const previewError = ref('')
const accessRevokedError = ref('')
const previewUrl = ref('')
const previewText = ref('')
const previewLoadedVersion = ref('')
let previewAbort: AbortController | undefined

const currentFile = computed(() => entryValue.value?.current?.file)
const inlineKind = computed(() => (entryValue.value?.download_allowed ? previewKind(currentFile.value) : undefined))
const canPreview = computed(() => !!inlineKind.value && !!currentFile.value && currentFile.value.size <= maxPreviewBytes)
const previewOversized = computed(() => !!inlineKind.value && !!currentFile.value && currentFile.value.size > maxPreviewBytes)

function clearPreview() {
  previewAbort?.abort()
  previewAbort = undefined
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  previewText.value = ''
  previewError.value = ''
  previewLoadedVersion.value = ''
  previewBusy.value = false
  previewOpen.value = false
  previewFullscreen.value = false
}

onBeforeUnmount(clearPreview)

watch(() => props.id, () => {
  requesting.value = false
  accessRevokedError.value = ''
  clearPreview()
  void entry.reload()
}, { immediate: true })

async function loadPreview() {
  const item = entryValue.value
  const file = item?.current?.file
  const kind = inlineKind.value
  if (!item || !file || !kind || previewBusy.value) return
  if (previewLoadedVersion.value === file.version_id && (previewUrl.value || previewText.value !== '')) return
  previewAbort?.abort()
  const controller = new AbortController()
  previewAbort = controller
  previewBusy.value = true
  previewError.value = ''
  try {
    const blob = await api.preview(item.id, file.size, controller.signal)
    if (controller.signal.aborted) return
    const buffer = await blob.arrayBuffer()
    if (controller.signal.aborted) return
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
    previewText.value = ''
    if (kind === 'text') {
      previewText.value = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    } else {
      const mime = kind === 'pdf' ? 'application/pdf' : (file.content_type.split(';')[0]?.trim() || 'image/png')
      previewUrl.value = URL.createObjectURL(new Blob([buffer], { type: mime }))
    }
    previewLoadedVersion.value = file.version_id
  } catch (failure) {
    if (controller.signal.aborted) return
    const code = errorCode(failure)
    previewError.value = code
    if (code === 'forbidden' || code === 'unauthenticated') {
      clearPreview()
      accessRevokedError.value = code
      entry.clear()
    }
  } finally {
    if (previewAbort === controller) previewBusy.value = false
  }
}

function togglePreview() {
  previewOpen.value = !previewOpen.value
  if (previewOpen.value) void loadPreview()
  else previewFullscreen.value = false
}

function openFullscreen() {
  previewOpen.value = true
  previewFullscreen.value = true
  void loadPreview()
}

async function save() {
  const item = entryValue.value
  const file = item?.current?.file
  if (!item || !file) return
  await download.run(() => api.download(item.id, file.filename, file.size))
  // Access was revoked: stop showing protected details.
  if (download.error.value === 'forbidden' || download.error.value === 'unauthenticated') {
    clearPreview()
    entry.clear()
  }
}

watch(version, (value) => {
  if (value?.metadata.title) rememberPage({ path: `/resources/items/${encodeURIComponent(props.id)}`, title: value.metadata.title, kind: 'resource' })
})

function accessReason(code: string) {
  return te(`resources.access.${code}`) ? t(`resources.access.${code}`) : t('resources.detail.accessRequired')
}
</script>

<template>
  <p
    v-if="download.error.value || accessRevokedError"
    class="notice notice-error"
    role="alert"
  >
    {{ errorText(download.error.value || accessRevokedError) }}
  </p>
  <AsyncState
    :status="entry.status.value"
    :error="entry.error.value"
    @retry="entry.reload"
  >
    <div
      v-if="entryValue && version"
      class="stack-lg"
    >
      <PageHeader
        :eyebrow="localName(version.category.names ?? {}, locale)"
        back="/resources"
        :back-label="t('resources.detail.back')"
        :title="version.metadata.title ?? ''"
      >
        <div class="row">
          <StatusTag :tone="entryValue.state === 'published' ? 'success' : entryValue.state === 'blocked' ? 'danger' : 'warning'">
            {{ t(`resources.state.${entryValue.state}`) }}
          </StatusTag>
          <span class="subtle">{{ format.date(version.created_at ?? '') }}</span>
        </div>
        <template #actions>
          <FavoriteButton
            v-if="capabilities.has(feature.favorites)"
            :id="id"
            kind="resource"
            text
          />
          <button
            v-if="canPreview"
            class="btn"
            type="button"
            :aria-expanded="previewOpen"
            @click="togglePreview"
          >
            <Eye aria-hidden="true" />{{ t(previewOpen ? 'resources.detail.hidePreview' : 'resources.detail.preview') }}
          </button>
          <button
            v-if="entryValue.download_allowed && entryValue.current?.file"
            class="btn btn-primary"
            type="button"
            :disabled="download.busy.value"
            @click="void save()"
          >
            {{ t('resources.detail.download') }}
          </button>
          <RouterLink
            v-if="entryValue.owned"
            class="btn"
            :to="`/resources/items/${encodeURIComponent(entryValue.id)}/edit`"
          >
            {{ t('resources.edit') }}
          </RouterLink>
          <button
            class="btn btn-ghost"
            type="button"
            :aria-expanded="requesting"
            @click="requesting = !requesting"
          >
            {{ t(entryValue.owned ? 'resources.detail.requestOwner' : 'resources.detail.complain') }}
          </button>
        </template>
      </PageHeader>

      <p
        v-if="!entryValue.download_allowed && !entryValue.available_methods?.includes('purchase')"
        class="notice notice-info"
      >
        <span>{{ accessReason(entryValue.unlock_reason || entryValue.access_reason) }}</span>
      </p>
      <UnlockPanel
        v-if="capabilities.has(feature.unlock) && !entryValue.download_allowed && entryValue.available_methods?.includes('purchase')"
        :resource-id="entryValue.id"
        @unlocked="entry.reload()"
      />
      <section
        v-if="entryValue.owned && entryValue.proposal"
        class="card stack-sm proposal-card"
        :aria-label="t('resources.detail.proposalTitle')"
      >
        <div class="row-between">
          <strong>{{ t('resources.detail.proposalTitle') }}</strong>
          <StatusTag :tone="entryValue.proposal.state === 'published' || entryValue.proposal.state === 'approved' ? 'success' : entryValue.proposal.state === 'rejected' || entryValue.proposal.state === 'blocked' ? 'danger' : 'warning'">
            {{ t(`resources.versionState.${entryValue.proposal.state}`) }}
          </StatusTag>
        </div>
        <p
          v-if="entryValue.current"
          class="small muted"
        >
          {{ t('resources.detail.pendingVersion') }}
        </p>
        <dl class="facts">
          <div>
            <dt>{{ t('resources.editor.title') }}</dt>
            <dd>{{ entryValue.proposal.metadata.title }}</dd>
          </div>
          <div v-if="entryValue.proposal.file">
            <dt>{{ t('resources.detail.proposalFile') }}</dt>
            <dd>{{ entryValue.proposal.file.filename }} · {{ format.bytes(entryValue.proposal.file.size) }} · {{ typeLabel(entryValue.proposal.file.content_type) }}</dd>
          </div>
          <div v-if="entryValue.proposal.file?.sha256">
            <dt>{{ t('resources.detail.checksum') }}</dt>
            <dd class="mono">
              {{ entryValue.proposal.file.sha256.slice(0, 16) }}
            </dd>
          </div>
        </dl>
      </section>
      <p
        v-else-if="entryValue.proposal && entryValue.current"
        class="notice notice-warning small"
      >
        {{ t('resources.detail.pendingVersion') }}
      </p>

      <section
        v-if="previewOpen && canPreview"
        class="card stack"
        :aria-label="t('resources.detail.previewTitle')"
      >
        <div class="row-between">
          <h2>{{ t('resources.detail.previewTitle') }}</h2>
          <div class="row">
            <button
              class="btn btn-sm"
              type="button"
              @click="openFullscreen"
            >
              <Maximize2 aria-hidden="true" />{{ t('resources.detail.fullscreenPreview') }}
            </button>
            <button
              class="btn btn-sm btn-ghost"
              type="button"
              @click="togglePreview"
            >
              {{ t('resources.detail.hidePreview') }}
            </button>
          </div>
        </div>
        <p
          v-if="previewBusy"
          class="subtle"
          role="status"
        >
          {{ t('common.loading') }}
        </p>
        <div
          v-else-if="previewError"
          class="notice notice-error row"
          role="alert"
        >
          <span>{{ errorText(previewError) }}</span>
          <button
            class="btn btn-sm"
            type="button"
            @click="void loadPreview()"
          >
            {{ t('common.retry') }}
          </button>
        </div>
        <iframe
          v-else-if="inlineKind === 'pdf' && previewUrl"
          class="preview-frame"
          :title="version.metadata.title ?? t('resources.detail.previewTitle')"
          :src="previewUrl"
        />
        <img
          v-else-if="inlineKind === 'image' && previewUrl"
          class="preview-image"
          :src="previewUrl"
          :alt="version.metadata.title ?? t('resources.detail.previewTitle')"
        >
        <pre
          v-else-if="inlineKind === 'text' && previewLoadedVersion"
          class="preview-text prewrap"
        >{{ previewText || t('resources.detail.emptyPreview') }}</pre>
      </section>

      <div class="layout-aside">
        <section class="card stack">
          <p
            class="prewrap"
            :class="{ muted: !version.metadata.description }"
          >
            {{ version.metadata.description || t('resources.detail.noDescription') }}
          </p>
          <div
            v-if="version.metadata.tags.length"
            class="row"
          >
            <span
              v-for="tag in version.metadata.tags"
              :key="tag"
              class="tag tag-info"
            >{{ tag }}</span>
          </div>
          <dl class="facts">
            <div
              v-for="field in version.category.fields"
              :key="field.key"
            >
              <dt>{{ localName(field.names, locale) }}</dt>
              <dd>{{ attributeText(field, version.metadata.attributes[field.key], locale) || t('common.notProvided') }}</dd>
            </div>
          </dl>
        </section>
        <aside class="card stack">
          <h2>{{ t('resources.detail.about') }}</h2>
          <dl class="facts single">
            <div v-if="version.file">
              <dt>{{ t('resources.detail.file') }}</dt>
              <dd>{{ version.file.filename }} · {{ format.bytes(version.file.size) }}</dd>
            </div>
            <div>
              <dt>{{ t('resources.detail.access') }}</dt>
              <dd>{{ t(`resources.accessLevel.${version.metadata.access ?? 'public'}`) }}</dd>
            </div>
            <div>
              <dt>{{ t('resources.origin.label') }}</dt>
              <dd>{{ t(`resources.origin.kinds.${version.metadata.origin.kind ?? 'unknown'}`) }}</dd>
            </div>
            <div v-if="version.metadata.origin.source">
              <dt>{{ t('resources.origin.source') }}</dt>
              <dd>{{ version.metadata.origin.source }}</dd>
            </div>
            <div v-if="version.metadata.origin.author">
              <dt>{{ t('resources.origin.author') }}</dt>
              <dd>{{ version.metadata.origin.author }}</dd>
            </div>
            <div v-if="version.metadata.origin.license">
              <dt>{{ t('resources.origin.license') }}</dt>
              <dd class="prewrap">
                {{ version.metadata.origin.license }}
              </dd>
            </div>
          </dl>
          <p
            v-if="previewOversized"
            class="subtle"
          >
            {{ t('resources.detail.previewTooLarge', { size: format.bytes(maxPreviewBytes) }) }}
          </p>
          <RouterLink
            v-if="version.metadata.associations.course_id"
            class="btn btn-sm"
            :to="`/courses/${encodeURIComponent(version.metadata.associations.course_id ?? '')}`"
          >
            {{ t('resources.detail.course') }}
          </RouterLink>
        </aside>
      </div>

      <section
        v-if="requesting"
        class="card"
      >
        <RequestForm
          :resource-id="entryValue.id"
          :owned="entryValue.owned"
        />
        <p class="small">
          <RouterLink to="/me/requests">
            {{ t('me.requests') }}
          </RouterLink>
        </p>
      </section>

      <SheetDialog
        :open="previewFullscreen"
        :title="version.metadata.title ?? t('resources.detail.previewTitle')"
        wide
        @close="previewFullscreen = false"
      >
        <div class="stack">
          <iframe
            v-if="inlineKind === 'pdf' && previewUrl"
            class="preview-frame fullscreen"
            :title="version.metadata.title ?? t('resources.detail.previewTitle')"
            :src="previewUrl"
          />
          <img
            v-else-if="inlineKind === 'image' && previewUrl"
            class="preview-image fullscreen"
            :src="previewUrl"
            :alt="version.metadata.title ?? t('resources.detail.previewTitle')"
          >
          <pre
            v-else-if="inlineKind === 'text' && previewLoadedVersion"
            class="preview-text fullscreen prewrap"
          >{{ previewText || t('resources.detail.emptyPreview') }}</pre>
          <div class="form-actions">
            <button
              class="btn"
              type="button"
              @click="previewFullscreen = false"
            >
              {{ t('common.close') }}
            </button>
          </div>
        </div>
      </SheetDialog>
    </div>
  </AsyncState>
</template>

<style scoped>
.single { grid-template-columns: 1fr; }
.preview-frame { width: 100%; height: min(72dvh, 42rem); border: .5px solid var(--separator); border-radius: var(--radius); background: var(--fill); }
.preview-frame.fullscreen { height: min(78dvh, 52rem); }
.preview-image { display: block; max-width: 100%; max-height: 70dvh; margin-inline: auto; border-radius: var(--radius); object-fit: contain; }
.preview-image.fullscreen { max-height: 78dvh; }
.preview-text { max-height: 32rem; margin: 0; padding: 1rem; overflow: auto; border-radius: var(--radius); background: var(--fill); font-family: var(--mono); font-size: .875rem; line-height: 1.55; }
.preview-text.fullscreen { max-height: 75dvh; }
</style>
