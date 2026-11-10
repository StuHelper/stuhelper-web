<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { Folder, Lock, Search, SlidersHorizontal, X } from 'lucide-vue-next'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync, useMutation, usePaged } from '../../shared/composables/async'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { useAcademic } from '../academic/api'
import { useCampusId } from '../account/access'
import { attributeText, localName, useResourcesApi, type Directory, type Package, type Resource, type Value } from './api'
import CatalogPicker from './CatalogPicker.vue'
import { parseAttributes, readTrail, rememberTrail } from './browseState'
import FieldInput from './FieldInput.vue'
import PackagePanel from './PackagePanel.vue'

// Browse published resources. Search, filters and folder live in the address, so
// reloading or returning shows the same list. Category fields, filters and
// grouping come from server configuration; nothing here depends on a category name.
const { t, locale } = useI18n()
const format = useFormat()
const route = useRoute()
const router = useRouter()
const api = useResourcesApi()
const catalog = useAcademic()
const campus = useCampusId()
const packing = useMutation()
const read = (key: string) => (typeof route.query[key] === 'string' ? String(route.query[key]) : '')

const applied = computed(() => ({ q: read('q'), category: read('category'), course: read('course_id'), dir: read('dir'), fields: parseAttributes(read('attrs')) }))
const text = ref(applied.value.q)
const filtering = ref(false)
const draft = reactive({ category: '', course: '' })
const draftFields = ref<Record<string, Value | undefined>>({})
const trail = shallowRef<Directory[]>([])
const selected = ref<string[]>([])
const pack = shallowRef<Package>()

const setup = useAsync(async (signal) => {
  const [capabilities, categories] = await Promise.all([api.capabilities(signal), api.categories(signal)])
  return { capabilities, categories }
})
const courseName = useAsync(async (signal) => (applied.value.course ? (await catalog.lookup([applied.value.course], signal)).get(applied.value.course)?.name ?? '' : ''))
const appliedCategory = computed(() => setup.data.value?.categories.find((item) => item.id === applied.value.category))
const draftCategory = computed(() => setup.data.value?.categories.find((item) => item.id === draft.category))
const directory = computed(() => trail.value.at(-1))

const results = usePaged(async (after, signal) => {
  const f = applied.value
  const attributes = Object.keys(f.fields).length ? JSON.stringify(f.fields) : undefined
  const page = await api.list({ school_id: campus.value, course_id: f.course, category_id: f.category, query: f.q, attributes, directory_id: f.dir || undefined, after }, signal)
  return { items: page.items, next: page.next_cursor }
})
const directories = usePaged(async (after, signal) => {
  const page = await api.directories({ school_id: campus.value, course_id: applied.value.course, parent_id: applied.value.dir || undefined, after }, signal)
  return { items: page.items, next: page.next_cursor }
})

// Grouping applies to the rows loaded so far, and an unknown value has its own group.
const groups = computed(() => {
  const key = appliedCategory.value?.group_by
  const rows = new Map<string, Resource[]>()
  for (const item of results.items.value) {
    const version = item.current
    if (!version) continue
    const label = key ? attributeText(version.category.fields.find((field) => field.key === key), version.metadata.attributes[key], locale.value) || t('resources.browse.unknownGroup') : ''
    rows.set(label, [...(rows.get(label) ?? []), item])
  }
  return [...rows]
})

const chips = computed(() => {
  const list: { key: string; label: string; clear: Record<string, undefined> }[] = []
  if (applied.value.category) list.push({ key: 'category', label: appliedCategory.value ? localName(appliedCategory.value.names, locale.value) : t('resources.category'), clear: { category: undefined, attrs: undefined } })
  if (applied.value.course) list.push({ key: 'course', label: courseName.data.value || t('academic.course'), clear: { course_id: undefined, dir: undefined } })
  const count = Object.keys(applied.value.fields).length
  if (count) list.push({ key: 'fields', label: t('resources.browse.fieldCount', { count: format.value.number(count) }), clear: { attrs: undefined } })
  return list
})

function navigate(changes: Record<string, string | undefined>) {
  void router.push({ path: route.path, query: { ...route.query, ...changes } })
}
function search() {
  navigate({ q: text.value.trim() || undefined })
}
function openFilters() {
  draft.category = applied.value.category
  draft.course = applied.value.course
  draftFields.value = { ...applied.value.fields }
  filtering.value = true
}
function applyFilters() {
  const fields = Object.fromEntries(Object.entries(draftFields.value).filter(([, value]) => value !== undefined))
  const courseChanged = draft.course !== applied.value.course
  filtering.value = false
  navigate({ q: text.value.trim() || undefined, category: draft.category || undefined, course_id: draft.course || undefined, attrs: Object.keys(fields).length ? JSON.stringify(fields) : undefined, ...(courseChanged ? { dir: undefined } : {}) })
}
function enter(next: Directory) {
  rememberTrail(next.id, [...trail.value, next])
  navigate({ dir: next.id })
}
function leaveTo(depth: number) {
  navigate({ dir: trail.value[depth - 1]?.id })
}

async function createPackage(all: boolean) {
  const body = all ? { directory_id: applied.value.dir } : { resource_ids: selected.value.slice() }
  const result = await packing.run(all ? `package:dir:${applied.value.dir}` : `package:items:${selected.value.join(',')}`, body, (value, key) => api.createPackage(value, key))
  if (result) pack.value = result
  else if (packing.error.value === 'forbidden' || packing.error.value === 'unauthenticated') {
    // Access was revoked: stop showing protected rows.
    results.clear()
    selected.value = []
  }
}
async function retryPackage() {
  const result = await packing.retry()
  // The retried request is the original package creation.
  if (result) pack.value = result as Package
}
function reload() {
  void results.reload()
  void directories.reload()
  if (setup.status.value === 'error') void setup.reload()
}

watch(() => draft.category, (value, previous) => {
  if (previous !== undefined && filtering.value) draftFields.value = {}
})
watch(() => route.fullPath, () => {
  if (route.path !== '/resources') return
  text.value = applied.value.q
  trail.value = readTrail(applied.value.dir)
  selected.value = []
  pack.value = undefined
  void results.reload()
  void directories.reload()
  void courseName.reload()
}, { immediate: true })
void setup.reload()
</script>

<template>
  <div class="browse">
    <PageHeader :title="t('nav.resources')">
      <template #actions>
        <RouterLink
          class="btn btn-primary"
          :to="{ path: '/resources/new', query: { course_id: applied.course || undefined } }"
        >
          {{ t('resources.upload') }}
        </RouterLink>
        <RouterLink
          class="btn"
          to="/me/resources"
        >
          {{ t('me.resources') }}
        </RouterLink>
      </template>
    </PageHeader>

    <form
      class="search-bar"
      role="search"
      @submit.prevent="search"
    >
      <label class="search-field">
        <span class="visually-hidden">{{ t('resources.browse.keyword') }}</span>
        <Search aria-hidden="true" />
        <input
          v-model="text"
          class="input"
          type="search"
          maxlength="200"
          :placeholder="t('resources.browse.placeholder')"
        >
      </label>
      <button
        class="btn btn-primary"
        type="submit"
      >
        {{ t('resources.browse.find') }}
      </button>
      <button
        class="btn"
        type="button"
        :disabled="!setup.data.value"
        @click="openFilters"
      >
        <SlidersHorizontal aria-hidden="true" />
        {{ chips.length ? t('common.filtersCount', { count: format.number(chips.length) }) : t('common.filters') }}
      </button>
    </form>

    <ul
      v-if="chips.length"
      class="chips"
      :aria-label="t('resources.browse.activeFilters')"
    >
      <li
        v-for="chip in chips"
        :key="chip.key"
      >
        <button
          class="chip"
          type="button"
          :aria-label="t('resources.browse.removeFilter', { name: chip.label })"
          @click="navigate(chip.clear)"
        >
          <span class="truncate">{{ chip.label }}</span>
          <X aria-hidden="true" />
        </button>
      </li>
    </ul>

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
          @click="createPackage(true)"
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
      @retry="retryPackage"
    />
    <PackagePanel
      v-if="pack && setup.data.value"
      :pack="pack"
      :limit="setup.data.value.capabilities.max_package_bytes"
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
      :empty-text="t('resources.browse.empty')"
      :retry-label="t('resources.browse.reload')"
      @retry="reload"
      @more="results.loadMore"
    >
      <div class="stack-lg">
        <section
          v-for="[label, rows] in groups"
          :key="label"
          class="section"
        >
          <h2 v-if="label">
            {{ label }}
          </h2>
          <ul class="group">
            <li
              v-for="item in rows"
              :key="item.id"
              class="resource-row"
            >
              <input
                v-if="item.download_allowed"
                v-model="selected"
                class="pick"
                type="checkbox"
                :value="item.id"
                :aria-label="t('resources.browse.select', { title: item.current?.metadata.title ?? '' })"
                :disabled="packing.busy.value || packing.uncertain.value"
              >
              <Lock
                v-else
                class="resource-lock"
                aria-hidden="true"
              />
              <div class="stack-sm">
                <RouterLink
                  class="card-title"
                  :to="`/resources/items/${encodeURIComponent(item.id)}`"
                >
                  {{ item.current?.metadata.title }}
                </RouterLink>
                <p
                  v-if="item.current?.metadata.description"
                  class="small muted clamp-2"
                >
                  {{ item.current.metadata.description }}
                </p>
                <div class="row subtle">
                  <span class="tag">{{ localName(item.current?.category.names ?? {}, locale) }}</span>
                  <span
                    v-if="item.current?.file"
                    class="tag"
                  >{{ format.bytes(item.current.file.size) }}</span>
                  <span
                    v-for="tag in item.current?.metadata.tags"
                    :key="tag"
                    class="tag tag-info"
                  >{{ tag }}</span>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </PagedState>

    <div
      v-if="selected.length"
      class="selection-bar row-between"
    >
      <span>{{ t('resources.browse.selected', { count: format.number(selected.length) }) }}</span>
      <div class="row">
        <button
          class="btn btn-sm"
          type="button"
          @click="selected = []"
        >
          {{ t('resources.browse.clearSelection') }}
        </button>
        <button
          class="btn btn-sm btn-primary"
          type="button"
          :disabled="packing.busy.value || packing.uncertain.value"
          @click="createPackage(false)"
        >
          {{ t('resources.browse.downloadSelected') }}
        </button>
      </div>
    </div>

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
.browse { display: grid; gap: 1rem; }
.search-bar { display: flex; flex-wrap: wrap; gap: .5rem; }
.search-field { position: relative; display: flex; flex: 1 1 14rem; align-items: center; min-width: 0; }
.search-field svg { position: absolute; inset-inline-start: .875rem; width: 1.125rem; height: 1.125rem; color: var(--label-3); pointer-events: none; }
.search-field .input { padding-inline-start: 2.5rem; border-radius: var(--pill); }
.chips { display: flex; flex-wrap: wrap; gap: .375rem; }
.chip { display: inline-flex; align-items: center; gap: .25rem; max-width: 16rem; min-height: 30px; padding: .125rem .5rem .125rem .75rem; border: 0; border-radius: var(--pill); background: var(--accent-soft); color: var(--accent); font: inherit; font-size: .8125rem; cursor: pointer; }
.chip svg { flex: none; width: .875rem; height: .875rem; }
.folders { display: grid; gap: .5rem; }
.resource-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .875rem; align-items: start; padding: .875rem 1.125rem; }
.resource-row + .resource-row { border-block-start: .5px solid var(--separator); }
.resource-lock { width: 20px; height: 20px; margin-inline: 2px; color: var(--label-3); }
.selection-bar { position: sticky; inset-block-end: calc(1rem + var(--safe-bottom)); z-index: 30; padding: .625rem .75rem .625rem 1.25rem; border-radius: var(--pill); background: var(--glass); box-shadow: var(--shadow-float), inset 0 0 0 .5px var(--separator); backdrop-filter: saturate(180%) blur(24px); -webkit-backdrop-filter: saturate(180%) blur(24px); }
@media (max-width: 760px) {
  .selection-bar { inset-block-end: calc(var(--tab-height) + var(--safe-bottom) + .75rem); border-radius: var(--radius-lg); }
  /* The search box comes first on phones; secondary links stay in one line. */
  .browse :deep(.page-actions .btn) { min-height: 36px; padding-block: .25rem; font-size: .875rem; }
  .search-field { flex-basis: 100%; }
  .search-bar .btn { flex: 1; }
}
</style>
