<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync, useMutation, usePaged } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { attributeText, localName, useResourcesApi, type Directory, type Package, type Resource, type Value } from './api'
import CatalogPicker from './CatalogPicker.vue'
import FieldInput from './FieldInput.vue'
import PackagePanel from './PackagePanel.vue'

// Browse published resources. Category fields, filters and grouping come from
// server configuration; nothing here depends on a category's name.
const { t, locale } = useI18n()
const format = useFormat()
const route = useRoute()
const api = useResourcesApi()
const packing = useMutation()
const read = (key: string) => (typeof route.query[key] === 'string' ? String(route.query[key]) : '')
const form = reactive({ school: read('school_id'), course: read('course_id'), category: '', text: '' })
const fields = ref<Record<string, Value | undefined>>({})
const applied = shallowRef({ ...form, fields: {} as Record<string, Value | undefined> })
const trail = ref<Directory[]>([])
const selected = ref<string[]>([])
const pack = shallowRef<Package>()

const setup = useAsync(async (signal) => {
  const [capabilities, categories] = await Promise.all([api.capabilities(signal), api.categories(signal)])
  return { capabilities, categories }
})
const category = computed(() => setup.data.value?.categories.find((item) => item.id === form.category))
const appliedCategory = computed(() => setup.data.value?.categories.find((item) => item.id === applied.value.category))
const directory = computed(() => trail.value.at(-1))

const results = usePaged(async (after, signal) => {
  const f = applied.value
  const attributes = Object.fromEntries(Object.entries(f.fields).filter(([, value]) => value !== undefined))
  const page = await api.list({ school_id: f.school, course_id: f.course, category_id: f.category, query: f.text, attributes: Object.keys(attributes).length ? JSON.stringify(attributes) : undefined, directory_id: directory.value?.id, after }, signal)
  return { items: page.items, next: page.next_cursor }
})
const directories = usePaged(async (after, signal) => {
  if (!applied.value.school) return { items: [], next: '' }
  const page = await api.directories({ school_id: applied.value.school, course_id: applied.value.course, parent_id: directory.value?.id, after }, signal)
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

function search() {
  applied.value = { ...form, fields: { ...fields.value } }
  selected.value = []
  pack.value = undefined
  void results.reload()
  void directories.reload()
}

function enter(next?: Directory) {
  if (next) trail.value = [...trail.value, next]
  else trail.value = trail.value.slice(0, -1)
  selected.value = []
  pack.value = undefined
  void results.reload()
  void directories.reload()
}

async function createPackage(all: boolean) {
  const body = all ? { directory_id: directory.value?.id } : { resource_ids: selected.value.slice() }
  const result = await packing.run(all ? `package:dir:${directory.value?.id ?? ''}` : `package:items:${selected.value.join(',')}`, body, (value, key) => api.createPackage(value, key))
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

watch(() => form.category, () => {
  fields.value = {}
})
watch(() => form.school, () => {
  form.course = ''
  trail.value = []
})
watch(() => form.course, () => {
  trail.value = []
})
onMounted(() => {
  void setup.reload()
  search()
})
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :eyebrow="t('resources.eyebrow')"
      :title="t('nav.resources')"
      :description="t('resources.browse.intro')"
    >
      <template #actions>
        <RouterLink
          class="btn btn-primary"
          :to="{ path: '/resources/new', query: { school_id: applied.school || undefined, course_id: applied.course || undefined } }"
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
      class="card stack"
      role="search"
      @submit.prevent="search"
    >
      <div class="form-grid">
        <label class="field">
          <span class="field-label">{{ t('resources.browse.keyword') }}</span>
          <input
            v-model="form.text"
            class="input"
            type="search"
            maxlength="200"
          >
        </label>
        <label class="field">
          <span class="field-label">{{ t('resources.category') }}</span>
          <select
            v-model="form.category"
            class="select"
          >
            <option value="">{{ t('common.all') }}</option>
            <option
              v-for="item in setup.data.value?.categories"
              :key="item.id"
              :value="item.id"
            >{{ localName(item.names, locale) }}</option>
          </select>
        </label>
        <CatalogPicker
          v-model="form.school"
          kind="school"
          :label="t('academic.directory.school')"
          :empty-label="t('common.all')"
        />
        <CatalogPicker
          v-model="form.course"
          kind="course"
          :label="t('academic.course')"
          :school="form.school || undefined"
          :disabled="!form.school"
          :empty-label="t('common.all')"
        />
        <FieldInput
          v-for="field in category?.fields.filter((item) => item.filterable)"
          :key="field.key"
          v-model="fields[field.key]"
          :field="field"
          filter
        />
      </div>
      <div class="form-actions">
        <button
          class="btn btn-primary"
          type="submit"
        >
          {{ t('common.search') }}
        </button>
      </div>
      <AsyncState
        v-if="setup.status.value === 'error'"
        :status="setup.status.value"
        :error="setup.error.value"
        @retry="setup.reload"
      />
    </form>

    <section
      v-if="applied.school"
      class="card stack-sm"
      :aria-label="t('resources.browse.folders')"
    >
      <nav
        class="row small"
        :aria-label="t('resources.browse.folderPath')"
      >
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="!directory"
          @click="trail = []; enter()"
        >
          {{ t('resources.browse.root') }}
        </button>
        <template
          v-for="item in trail"
          :key="item.id"
        >
          <span aria-hidden="true">/</span>
          <span>{{ localName(item.names, locale) }}</span>
        </template>
      </nav>
      <div class="row">
        <button
          v-if="directory"
          class="btn btn-sm"
          type="button"
          @click="enter()"
        >
          {{ t('resources.browse.up') }}
        </button>
        <button
          v-for="item in directories.items.value"
          :key="item.id"
          class="btn btn-sm"
          type="button"
          @click="enter(item)"
        >
          {{ localName(item.names, locale) }}
        </button>
        <button
          v-if="directories.next.value"
          class="btn btn-sm btn-ghost"
          type="button"
          @click="directories.loadMore"
        >
          {{ t('common.loadMore') }}
        </button>
        <span
          v-if="directories.status.value === 'ready' && !directories.items.value.length && !directory"
          class="subtle"
        >{{ t('resources.browse.noFolders') }}</span>
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
      @retry="results.reload"
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
          <ul class="list">
            <li
              v-for="item in rows"
              :key="item.id"
              class="card resource-row"
            >
              <input
                v-if="item.download_allowed"
                v-model="selected"
                type="checkbox"
                :value="item.id"
                :aria-label="t('resources.browse.select', { title: item.current?.metadata.title ?? '' })"
                :disabled="packing.busy.value || packing.uncertain.value"
              >
              <span
                v-else
                class="resource-lock"
                :title="t('resources.detail.accessRequired')"
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
                  class="small muted clamp"
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
      class="selection-bar card row-between"
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
  </div>
</template>

<style scoped>
.resource-row { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .8rem; align-items: start; }
.resource-row input { margin-block-start: .35rem; width: 1rem; height: 1rem; accent-color: var(--accent); }
.resource-lock { font-size: .85rem; opacity: .6; }
.resource-lock::before { content: '🔒'; }
.card-title { color: var(--text); text-decoration: none; }
.card-title:hover { color: var(--accent); }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.selection-bar { position: sticky; bottom: 1rem; z-index: 10; border-color: var(--accent); }
</style>
