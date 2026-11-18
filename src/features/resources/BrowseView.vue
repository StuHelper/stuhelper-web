<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { Download, Folder, Lock, SlidersHorizontal, Upload } from 'lucide-vue-next'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { usePageFilters } from '../../shared/pageFilters'
import { useAsync, useMutation, usePaged } from '../../shared/composables/async'
import FilterBar from '../../shared/ui/FilterBar.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import RowMore from '../../shared/ui/RowMore.vue'
import SearchField from '../../shared/ui/SearchField.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { useErrorText } from '../../shared/ui/messages'
import { toast } from '../../shared/ui/toast'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import { useAcademic } from '../academic/api'
import { useCampusId } from '../account/access'
import { attributeText, localName, typeExtension, useResourcesApi, type Directory, type Package, type Resource, type Schema, type Value } from './api'
import CatalogPicker from './CatalogPicker.vue'
import { parseAttributes, readTrail, rememberTrail } from './browseState'
import FieldInput from './FieldInput.vue'
import FileThumb from './FileThumb.vue'
import PackagePanel from './PackagePanel.vue'

// Browse published resources. Search, filters and folder live in page state
// (not the address), so reloading or returning shows the same list. The course
// list on the side is the viewer's recently visited courses, not a fixed list. Category fields, filters and
// grouping come from server configuration; nothing here depends on a category name.
const { t, locale } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const router = useRouter()
const api = useResourcesApi()
const catalog = useAcademic()
const campus = useCampusId()
const packing = useMutation()
const page = usePageFilters(['q', 'category', 'course_id', 'dir', 'attrs', 'file_type', 'sort'] as const)
const applied = computed(() => {
  const f = page.values.value
  return {
    q: f.q,
    category: f.category,
    course: f.course_id,
    dir: f.dir,
    fileType: /^[a-z0-9]{1,12}$/.test(f.file_type) ? f.file_type : '',
    sort: (f.sort === 'id' ? 'id' : 'newest') as 'newest' | 'id',
    fields: parseAttributes(f.attrs),
  }
})
const text = ref(applied.value.q)
const filtering = ref(false)
const draft = reactive({ category: '', course: '', fileType: '' })
const draftFields = ref<Record<string, Value | undefined>>({})
const trail = shallowRef<Directory[]>([])
const selected = ref<string[]>([])
const pack = shallowRef<{ result: Package; request: Schema['PackageRequest'] }>()
const lookedUpCourses = shallowRef(new Map<string, string>())

const setup = useAsync(async (signal) => {
  const [capabilities, categories] = await Promise.all([api.capabilities(signal), api.categories(signal)])
  return { capabilities, categories }
})
const defaultTypes = ['pdf', 'zip', 'docx', 'pptx', 'txt', 'png', 'jpg']
const fileTypes = computed(() => {
  const configured = (setup.data.value?.capabilities.allowed_types ?? []).map(typeExtension).filter((ext): ext is string => !!ext)
  return [...new Set(configured.length ? configured : defaultTypes)]
})
const courseName = useAsync(async (signal) => (applied.value.course ? (await catalog.lookup([applied.value.course], signal)).get(applied.value.course)?.name ?? '' : ''))
const appliedCategory = computed(() => setup.data.value?.categories.find((item) => item.id === applied.value.category))
const draftCategory = computed(() => setup.data.value?.categories.find((item) => item.id === draft.category))
const directory = computed(() => trail.value.at(-1))

const total = ref(0)
const results = usePaged(async (after, signal) => {
  const f = applied.value
  const attributes = Object.keys(f.fields).length ? JSON.stringify(f.fields) : undefined
  const page = await api.list({ school_id: campus.value, course_id: f.course, category_id: f.category, query: f.q, attributes, directory_id: f.dir || undefined, file_type: f.fileType || undefined, sort: f.sort, after }, signal)
  if (!after) total.value = page.total
  const missing = page.items.map((item) => item.current?.metadata.associations.course_id).filter((id): id is string => !!id && !lookedUpCourses.value.has(id))
  if (missing.length) {
    try {
      const resolved = await catalog.lookup(missing, signal)
      const next = new Map(lookedUpCourses.value)
      for (const [id, obj] of resolved) next.set(id, obj.name)
      lookedUpCourses.value = next
    } catch {
      // Supplementary course names do not block displaying resource rows.
    }
  }
  return { items: page.items, next: page.next_cursor }
})
const directories = usePaged(async (after, signal) => {
  const page = await api.directories({ school_id: campus.value, course_id: applied.value.course, parent_id: applied.value.dir || undefined, after }, signal)
  return { items: page.items, next: page.next_cursor }
})

// Grouping applies to the rows loaded so far, sorted deterministically in descending order with unknown values last.
const groups = computed(() => {
  const key = appliedCategory.value?.group_by
  const rows = new Map<string, Resource[]>()
  const unknown = t('resources.browse.unknownGroup')
  for (const item of results.items.value) {
    const version = item.current
    if (!version) continue
    const label = key ? attributeText(version.category.fields.find((field) => field.key === key), version.metadata.attributes[key], locale.value) || unknown : ''
    rows.set(label, [...(rows.get(label) ?? []), item])
  }
  if (!key) return [...rows]
  return [...rows].sort(([a], [b]) => {
    if (a === unknown && b !== unknown) return 1
    if (b === unknown && a !== unknown) return -1
    return format.value.compare(b, a)
  })
})

const chips = computed(() => {
  const list: { key: string; label: string; clear: Record<string, undefined> }[] = []
  if (applied.value.category) list.push({ key: 'category', label: appliedCategory.value ? localName(appliedCategory.value.names, locale.value) : t('resources.category'), clear: { category: undefined, attrs: undefined } })
  if (applied.value.course) list.push({ key: 'course', label: courseName.data.value || t('academic.course'), clear: { course_id: undefined, dir: undefined } })
  if (applied.value.fileType) list.push({ key: 'file_type', label: applied.value.fileType.toUpperCase(), clear: { file_type: undefined } })
  const count = Object.keys(applied.value.fields).length
  if (count) list.push({ key: 'fields', label: t('resources.browse.fieldCount', { count: format.value.number(count) }), clear: { attrs: undefined } })
  return list
})

// Each change adds a history entry, so back leaves a folder or undoes a filter.
function navigate(changes: Record<string, string | undefined>) {
  page.push(changes)
}
function search() {
  navigate({ q: text.value.trim() || undefined })
}
function openFilters() {
  draft.category = applied.value.category
  draft.course = applied.value.course
  draft.fileType = applied.value.fileType
  draftFields.value = { ...applied.value.fields }
  filtering.value = true
}
function applyFilters() {
  const fields = Object.fromEntries(Object.entries(draftFields.value).filter(([, value]) => value !== undefined))
  const courseChanged = draft.course !== applied.value.course
  filtering.value = false
  navigate({ q: text.value.trim() || undefined, category: draft.category || undefined, course_id: draft.course || undefined, file_type: draft.fileType || undefined, attrs: Object.keys(fields).length ? JSON.stringify(fields) : undefined, ...(courseChanged ? { dir: undefined } : {}) })
}
function enter(next: Directory) {
  rememberTrail(next.id, [...trail.value, next])
  navigate({ dir: next.id })
}
function leaveTo(depth: number) {
  navigate({ dir: trail.value[depth - 1]?.id })
}

async function createPackage(request: Schema['PackageRequest']) {
  await packing.run('package:' + JSON.stringify(request), request, async (body, key) => {
    const result = await api.createPackage(body, key)
    // A successful retry uses the same frozen selection as the initial request.
    pack.value = { result, request: body }
    return result
  })
  if (packing.error.value === 'forbidden' || packing.error.value === 'unauthenticated') {
    // Access was revoked: stop showing protected rows.
    results.clear()
    selected.value = []
  }
}
function reload() {
  void results.reload()
  void directories.reload()
  if (setup.status.value === 'error') void setup.reload()
}

watch(() => draft.category, (value, previous) => {
  if (previous !== undefined && filtering.value) draftFields.value = {}
})
watch(page.signature, () => {
  text.value = applied.value.q
  trail.value = readTrail(applied.value.dir)
  selected.value = []
  pack.value = undefined
  void results.reload()
  void directories.reload()
  void courseName.reload()
}, { immediate: true })
void setup.reload()

// Recently visited courses (only the viewer's own; at most 20, kept 90 days). The server
// records a visit when a course page is read.
const recent = useAsync((signal) => catalog.recentCourses(signal))
void recent.reload()
const clearingRecent = ref(false)
async function clearRecent() {
  clearingRecent.value = true
  try {
    await catalog.clearRecentCourses()
    if (applied.value.course && recent.data.value?.items.some((row) => row.course.id === applied.value.course)) navigate({ course_id: undefined, dir: undefined })
    await recent.reload()
  } catch {
    // The list stays as it was; a failed clear is shown by the unchanged list.
  } finally {
    clearingRecent.value = false
  }
}
const recentRows = computed(() => recent.data.value?.items ?? [])
const courseLabel = computed(() => recentRows.value.find((row) => row.course.id === applied.value.course)?.course.name ?? courseName.data.value ?? '')

// Typing waits for a pause and replaces the current entry, so back does not step
// through every key press. Enter searches immediately.
let typing: ReturnType<typeof setTimeout> | undefined
// A pending search must not write into another page's state after this one is left.
onBeforeUnmount(() => clearTimeout(typing))
watch(text, (value) => {
  clearTimeout(typing)
  if (value.trim() === applied.value.q) return
  typing = setTimeout(() => page.replace({ q: value.trim() || undefined }), 300)
})

// Batch download starts with an explicit selection mode, as in the list design.
const selecting = ref(false)
function toggleSelecting() {
  selecting.value = !selecting.value
  selected.value = []
}
const activeFilters = computed(() => [
  ...chips.value.map((chip) => ({ key: chip.key, label: chip.label, clear: () => navigate(chip.clear) })),
  ...(applied.value.q ? [{ key: 'q', label: `“${applied.value.q}”`, clear: () => { text.value = ''; navigate({ q: undefined }) } }] : []),
])
function clearAll() {
  text.value = ''
  navigate({ q: undefined, category: undefined, course_id: undefined, attrs: undefined, file_type: undefined, dir: undefined })
}
function ago(iso?: string) {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 6e4)
  if (!Number.isFinite(minutes)) return ''
  if (minutes < 60) return format.value.relative(-Math.max(minutes, 1), 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return format.value.relative(-hours, 'hour')
  const days = Math.round(hours / 24)
  return days < 30 ? format.value.relative(-days, 'day') : format.value.relative(-Math.round(days / 30), 'month')
}
function rowCourseName(courseId: string | undefined) {
  if (!courseId || courseId === applied.value.course) return ''
  return recentRows.value.find((row) => row.course.id === courseId)?.course.name ?? lookedUpCourses.value.get(courseId) ?? ''
}
const meta = (item: Resource) => [rowCourseName(item.current?.metadata.associations.course_id), localName(item.current?.category.names ?? {}, locale.value), item.current?.file ? format.value.bytes(item.current.file.size) : '', ago(item.current?.created_at)].filter(Boolean).join(' · ')
const downloading = ref('')
async function download(item: Resource) {
  const file = item.current?.file
  if (!file || downloading.value) return
  if (!item.download_allowed) {
    void router.push(`/resources/items/${encodeURIComponent(item.id)}`)
    return
  }
  downloading.value = item.id
  try {
    await api.download(item.id, file.filename, file.size)
  } catch (failure) {
    const code = errorCode(failure)
    if (code === 'network' || code === 'timeout' || code === 'unavailable') {
      toast(errorText(code))
    } else {
      // Permission or state changes are explained on the detail page.
      void router.push(`/resources/items/${encodeURIComponent(item.id)}`)
    }
  } finally {
    downloading.value = ''
  }
}
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :title="t('nav.resources')"
      :description="t('browse.resourcesDescription')"
    >
      <template #actions>
        <RouterLink
          class="btn btn-sm"
          to="/me/resources"
        >
          {{ t('me.resources') }}
        </RouterLink>
        <RouterLink
          class="btn btn-sm btn-primary"
          :to="{ path: '/resources/new', query: { course_id: applied.course || undefined }, state: { directory_id: applied.dir || undefined } }"
        >
          <Upload aria-hidden="true" />{{ t('resources.upload') }}
        </RouterLink>
      </template>
    </PageHeader>

    <div class="stack">
      <div class="row filters">
        <SearchField
          v-model="text"
          :aria-label="t('browse.searchResourcesLabel')"
          :placeholder="t('browse.searchResourcesHint')"
          @keydown.enter="search"
        />
        <AppSelect
          v-if="recentRows.length"
          :model-value="applied.course"
          class="select mini narrow-only"
          :aria-label="t('browse.recentCourses')"
          @update:model-value="(value: string) => navigate({ course_id: value || undefined, dir: undefined })"
        >
          <option value="">
            {{ t('browse.allResources') }}
          </option>
          <option
            v-if="applied.course && !recentRows.some((row) => row.course.id === applied.course)"
            :value="applied.course"
          >
            {{ courseLabel || t('academic.course') }}
          </option>
          <option
            v-for="row in recentRows"
            :key="row.course.id"
            :value="row.course.id"
          >
            {{ row.course.name }}
          </option>
        </AppSelect>
        <AppSelect
          :model-value="applied.sort"
          class="select mini"
          :aria-label="t('resources.browse.sort')"
          @update:model-value="(value: string) => navigate({ sort: value === 'id' ? 'id' : undefined })"
        >
          <option value="newest">
            {{ t('resources.browse.sortNewest') }}
          </option>
          <option value="id">
            {{ t('resources.browse.sortDefault') }}
          </option>
        </AppSelect>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="!setup.data.value"
          @click="openFilters"
        >
          <SlidersHorizontal aria-hidden="true" />{{ t('common.filters') }}
        </button>
      </div>
      <div class="row-between">
        <div
          class="d-chips"
          role="group"
          :aria-label="t('browse.resourceCategory')"
        >
          <button
            class="d-chip"
            type="button"
            :aria-pressed="!applied.category"
            @click="navigate({ category: undefined, attrs: undefined })"
          >
            {{ t('browse.all') }}
          </button>
          <button
            v-for="c in setup.data.value?.categories"
            :key="c.id"
            class="d-chip"
            type="button"
            :aria-pressed="applied.category === c.id"
            @click="navigate({ category: c.id, attrs: undefined })"
          >
            {{ localName(c.names, locale) }}
          </button>
        </div>
        <button
          class="btn btn-sm"
          type="button"
          :aria-pressed="selecting"
          @click="toggleSelecting"
        >
          {{ selecting ? t('browse.cancelSelection') : t('browse.batchDownload') }}
        </button>
      </div>
      <FilterBar
        :items="activeFilters"
        :total="results.status.value === 'ready' ? t('browse.totalFiles', { p0: format.number(total) }) : undefined"
        @clear-all="clearAll"
      />
      <p
        v-if="setup.status.value === 'error' && results.status.value !== 'error'"
        class="field-error row"
        role="alert"
      >
        <span>{{ t('resources.browse.filtersFailed') }}</span>
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          @click="setup.reload"
        >
          {{ t('resources.browse.filtersRetry') }}
        </button>
      </p>
    </div>

    <div class="layout">
      <nav
        class="tree card"
        :aria-label="t('browse.recentCourses')"
      >
        <button
          class="node"
          type="button"
          :aria-pressed="!applied.course"
          @click="navigate({ course_id: undefined, dir: undefined })"
        >
          <span>{{ t('browse.allResources') }}</span>
        </button>
        <p class="tree-label subtle">
          {{ t('browse.recentCourses') }}
        </p>
        <button
          v-for="row in recentRows"
          :key="row.course.id"
          class="node"
          type="button"
          :aria-pressed="applied.course === row.course.id"
          @click="navigate({ course_id: row.course.id, dir: undefined })"
        >
          <span class="truncate">{{ row.course.name }}</span>
          <span
            v-if="recent.data.value?.resources_state === 'available' && row.resource_count !== null"
            class="subtle"
          >{{ format.number(row.resource_count ?? 0) }}</span>
        </button>
        <p
          v-if="recent.status.value === 'ready' && !recentRows.length"
          class="subtle tree-empty"
        >
          {{ t('browse.noRecentCourses') }}
        </p>
        <p
          v-else-if="recent.status.value === 'error'"
          class="subtle tree-empty"
        >
          {{ t('browse.recentUnavailable') }}
        </p>
        <button
          v-if="recentRows.length"
          class="btn btn-sm btn-ghost clear-recent"
          type="button"
          :disabled="clearingRecent"
          @click="clearRecent"
        >
          {{ t('browse.clearRecent') }}
        </button>
      </nav>

      <div class="results stack">
        <section
          v-if="results.status.value !== 'error' && (directory || directories.items.value.length || directories.next.value)"
          class="folders"
          :aria-label="t('resources.browse.folders')"
        >
          <nav
            v-if="directory"
            class="row small"
            :aria-label="t('resources.browse.folderPath')"
          >
            <button
              class="btn btn-sm btn-ghost"
              type="button"
              @click="leaveTo(0)"
            >
              {{ t('resources.browse.root') }}
            </button>
            <template
              v-for="(item, index) in trail"
              :key="item.id"
            >
              <span aria-hidden="true">/</span>
              <button
                v-if="index < trail.length - 1"
                class="btn btn-sm btn-ghost"
                type="button"
                @click="leaveTo(index + 1)"
              >
                {{ localName(item.names, locale) }}
              </button>
              <span
                v-else
                aria-current="location"
              >{{ localName(item.names, locale) || t('resources.browse.currentFolder') }}</span>
            </template>
          </nav>
          <div class="row">
            <button
              v-for="item in directories.items.value"
              :key="item.id"
              class="btn btn-sm"
              type="button"
              @click="enter(item)"
            >
              <Folder aria-hidden="true" />{{ localName(item.names, locale) }}
            </button>
            <button
              v-if="directories.next.value"
              class="btn btn-sm btn-ghost"
              type="button"
              @click="directories.loadMore"
            >
              {{ t('common.loadMore') }}
            </button>
          </div>
          <div
            v-if="directory"
            class="row"
          >
            <button
              class="btn btn-sm btn-primary"
              type="button"
              :disabled="packing.busy.value || packing.uncertain.value"
              @click="createPackage({ directory_id: applied.dir })"
            >
              {{ t('resources.browse.downloadFolder') }}
            </button>
            <span class="subtle">{{ t('resources.browse.downloadFolderHint') }}</span>
          </div>
        </section>

        <MutationNotice
          :busy="packing.busy.value"
          :error="packing.error.value"
          :uncertain="packing.uncertain.value"
          @retry="packing.retry()"
        />
        <PackagePanel
          v-if="pack && setup.data.value"
          :key="pack.result.id"
          :pack="pack.result"
          :limit="setup.data.value.capabilities.max_package_bytes"
          :busy="packing.busy.value || packing.uncertain.value"
          @recreate="createPackage(pack.request)"
        />
        <p
          v-if="appliedCategory?.group_by && results.items.value.length"
          class="small muted"
        >
          {{ t('resources.browse.groupScope') }}
        </p>
        <PagedState
          :status="results.status.value"
          :error="results.error.value"
          :count="results.items.value.length"
          :next="results.next.value"
          :appending="results.appending.value"
          :empty-text="t(activeFilters.length ? 'browse.noMatchResources' : 'resources.browse.empty')"
          :filtered="activeFilters.length > 0"
          :total="total"
          :retry-label="t('resources.browse.reload')"
          @retry="reload"
          @more="results.loadMore"
        >
          <div
            :key="`${applied.category}|${applied.course}`"
            class="stack d-list-in"
          >
            <section
              v-for="[label, rows] in groups"
              :key="label"
              class="stack-sm"
            >
              <h2
                v-if="label"
                class="d-title"
              >
                {{ label }}
              </h2>
              <ul class="files">
                <li
                  v-for="item in rows"
                  :key="item.id"
                  class="card file"
                >
                  <label
                    v-if="selecting && item.download_allowed"
                    class="pick-wrap"
                  ><input
                    v-model="selected"
                    class="pick"
                    type="checkbox"
                    :value="item.id"
                    :aria-label="t('resources.browse.select', { title: item.current?.metadata.title ?? '' })"
                    :disabled="packing.busy.value || packing.uncertain.value"
                  ></label>
                  <FileThumb
                    :filename="item.current?.file?.filename"
                    :seed="item.current?.category.id"
                  />
                  <div class="group-body body">
                    <RouterLink
                      class="card-title"
                      :to="`/resources/items/${encodeURIComponent(item.id)}`"
                    >
                      {{ item.current?.metadata.title }}
                    </RouterLink>
                    <p
                      v-if="item.current?.metadata.description"
                      class="muted small clamp-2"
                    >
                      {{ item.current.metadata.description }}
                    </p>
                    <p class="subtle">
                      {{ meta(item) }}
                    </p>
                  </div>
                  <div
                    v-if="!selecting"
                    class="ops"
                  >
                    <button
                      v-if="item.download_allowed && item.current?.file"
                      class="btn btn-sm btn-icon btn-quiet desk"
                      type="button"
                      :disabled="downloading === item.id"
                      :aria-busy="downloading === item.id"
                      :aria-label="t('browse.downloadItem', { p0: item.current.metadata.title })"
                      @click="download(item)"
                    >
                      <Download aria-hidden="true" />
                    </button>
                    <RouterLink
                      v-else
                      class="btn btn-sm btn-icon btn-quiet desk"
                      :to="`/resources/items/${encodeURIComponent(item.id)}`"
                      :aria-label="t('browse.unlockItem', { p0: item.current?.metadata.title ?? '' })"
                    >
                      <Lock aria-hidden="true" />
                    </RouterLink>
                    <FavoriteButton
                      :id="item.id"
                      kind="resource"
                      quiet
                    />
                    <RowMore
                      v-if="item.download_allowed && item.current?.file"
                      :label="t('browse.moreActionsFor', { p0: item.current.metadata.title })"
                      :items="[{ label: t('browse.download'), icon: Download, action: () => download(item) }]"
                    />
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </PagedState>
      </div>
    </div>

    <Transition name="page">
      <div
        v-if="selecting && selected.length"
        class="selection-bar row-between"
      >
        <span>{{ t('resources.browse.selected', { count: format.number(selected.length) }) }}</span>
        <button
          class="btn btn-sm btn-primary"
          type="button"
          :disabled="packing.busy.value || packing.uncertain.value"
          @click="createPackage({ resource_ids: selected.slice() })"
        >
          {{ t('browse.packDownload') }}
        </button>
      </div>
    </Transition>

    <SheetDialog
      :open="filtering"
      :title="t('common.filters')"
      @close="filtering = false"
    >
      <form
        class="stack"
        @submit.prevent="applyFilters"
      >
        <label class="field">
          <span class="field-label">{{ t('resources.category') }}</span>
          <AppSelect
            v-model="draft.category"
            class="select"
          >
            <option value="">{{ t('common.all') }}</option>
            <option
              v-for="item in setup.data.value?.categories"
              :key="item.id"
              :value="item.id"
            >{{ localName(item.names, locale) }}</option>
          </AppSelect>
        </label>
        <CatalogPicker
          v-model="draft.course"
          kind="course"
          :label="t('academic.course')"
          :school="campus"
          :empty-label="t('common.all')"
        />
        <label class="field">
          <span class="field-label">{{ t('resources.browse.fileType') }}</span>
          <AppSelect
            v-model="draft.fileType"
            class="select"
          >
            <option value="">{{ t('common.all') }}</option>
            <option
              v-for="ext in fileTypes"
              :key="ext"
              :value="ext"
            >{{ ext.toUpperCase() }}</option>
          </AppSelect>
        </label>
        <FieldInput
          v-for="field in draftCategory?.fields.filter((item) => item.filterable)"
          :key="field.key"
          v-model="draftFields[field.key]"
          :field="field"
          filter
        />
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="submit"
          >
            {{ t('resources.browse.find') }}
          </button>
          <button
            class="btn"
            type="button"
            @click="filtering = false"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </form>
    </SheetDialog>
  </div>
</template>

<style scoped>
.filters { gap: .5rem; }
.mini { width: auto; min-height: 42px; padding-block: .375rem; border-radius: var(--pill); background-color: var(--surface); box-shadow: var(--shadow-card); font-size: .9375rem; flex: 0 1 13rem; }
.files { display: grid; gap: .625rem; }
.file { display: flex; align-items: flex-start; gap: .875rem; padding: 1rem; transition: box-shadow .3s; }
.file:hover { box-shadow: var(--shadow-lift); }
.body { gap: .25rem; }
.clamp-2 { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.ops { position: relative; display: flex; flex: none; gap: .25rem; }
/* Downloading is the reason to be here, so the actions are always visible; they only get stronger on hover. */
@media (hover: hover) and (min-width: 761px) {
  .ops .btn { opacity: .7; transition: opacity .15s, background-color .2s, color .2s; }
  .file:hover .ops .btn, .file:focus-within .ops .btn, .ops .btn[aria-pressed="true"] { opacity: 1; }
}
@media (max-width: 760px) { .ops .desk { display: none; } }
@media (max-width: 640px) { .file { flex-wrap: nowrap; gap: .625rem; padding: .875rem; } .ops { gap: .125rem; } .file .body { flex: 1 1 0; min-width: 0; } }
.layout { display: grid; gap: 1rem; }
.results { min-width: 0; }
.folders { display: grid; gap: .5rem; }
.tree { display: none; padding: .5rem; align-self: start; position: sticky; inset-block-start: calc(var(--nav-height) + 1rem); max-height: calc(100dvh - var(--nav-height) - 2rem); overflow-y: auto; }
.tree-label { padding: .5rem .625rem .25rem; font-size: .75rem; }
.tree-empty { padding: .25rem .625rem .5rem; font-size: .8125rem; }
.clear-recent { width: 100%; justify-content: flex-start; margin-block-start: .25rem; }
.node { display: flex; align-items: center; justify-content: space-between; gap: .5rem; width: 100%; min-height: 34px; padding: .25rem .625rem; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--label); font: inherit; font-size: .875rem; text-align: start; cursor: pointer; }
.node:hover { background: var(--fill); }
.node[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 550; }
@media (min-width: 1000px) { .layout { grid-template-columns: 14rem minmax(0, 1fr); } .tree { display: block; } .narrow-only { display: none; } }
.pick-wrap { display: flex; align-self: center; }
.selection-bar { position: sticky; inset-block-end: calc(1rem + var(--safe-bottom)); z-index: 30; padding: .625rem .75rem .625rem 1.25rem; border-radius: var(--pill); background: var(--glass); box-shadow: var(--glass-edge), var(--shadow-float); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter); }
@media (max-width: 760px) { .selection-bar { inset-block-end: calc(var(--tab-height) + var(--safe-bottom) + .75rem); border-radius: var(--radius-lg); } }
</style>
