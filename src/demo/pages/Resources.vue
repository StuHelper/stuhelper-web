<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { ChevronLeft, ChevronRight, Download, Eye, FileText, FileType2, Minus, Plus, Upload } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import { courses, resCategories, resources } from '../data'
import { fileSize, relative, toast } from '../store'
import Drawer from './Drawer.vue'
import FavButton from './FavButton.vue'
import FilterBar from './FilterBar.vue'
import RowMore from './RowMore.vue'
import SearchField from './SearchField.vue'
const { t: tr } = useI18n()

const route = useRoute()
const router = useRouter()
// 筛选条件保存在网址里。课程详情页的“课程资料”链接使用 course_id。
const read = (key: string) => (typeof route.query[key] === 'string' ? route.query[key] : '')
const q = ref(read('q'))
const cat = ref(read('cat'))
const course = ref(read('course_id') || read('course'))
watch([q, cat, course], ([search, category, target]) => {
  const query = { ...route.query }
  delete query.course
  for (const [key, value] of [['q', search.trim()], ['cat', category], ['course_id', target]] as const) {
    if (value) query[key] = value
    else delete query[key]
  }
  if (JSON.stringify(query) !== JSON.stringify(route.query)) void router.replace({ query })
})
watch(() => route.query, () => { q.value = read('q'); cat.value = read('cat'); course.value = read('course_id') || read('course') })
const selecting = ref(false)
const picked = ref<string[]>([])
const rows = computed(() => resources.filter((r) => r.current).filter((r) => { const m = r.current!.metadata; return (!q.value.trim() || m.title.includes(q.value.trim()) || m.description.includes(q.value.trim())) && (!cat.value || m.category_id === cat.value) && (!course.value || m.associations.course_id === course.value) }))
const published = computed(() => resources.filter((r) => r.current))
const tree = computed(() => courses.map((c) => ({ id: c.id, name: c.name, count: published.value.filter((r) => r.current!.metadata.associations.course_id === c.id).length })).filter((n) => n.count))
const preview = ref<(typeof resources)[number]>()
const pageNo = ref(1); const zoom = ref(100)
const pageCount = computed(() => (preview.value ? Math.round(preview.value.current!.file!.size / 400000) % 24 + 2 : 1))
watch(preview, () => { pageNo.value = 1; zoom.value = 100 })
const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? ''
const tints: Record<string, string> = { exam: 'var(--c-red)', note: 'var(--c-orange)', slide: 'var(--c-blue)', solution: 'var(--c-green)' }
const catLabel = (id: string) => resCategories.find((c) => c.id === id)?.names['zh-CN'] ?? ''
const activeFilters = computed(() => [
  ...(cat.value ? [{ key: 'cat', label: catLabel(cat.value), clear: () => { cat.value = '' } }] : []),
  ...(course.value ? [{ key: 'course', label: courseName(course.value), clear: () => { course.value = '' } }] : []),
  ...(q.value.trim() ? [{ key: 'q', label: `“${q.value.trim()}”`, clear: () => { q.value = '' } }] : []),
])
function clearFilters() { cat.value = ''; course.value = ''; q.value = '' }
function download(name: string) { toast(tr('demo.downloadStarted', { p0: name })) }
function batch() { toast(tr('demo.packed', { p0: picked.value.length })); picked.value = []; selecting.value = false }
</script>

<template>
  <div class="stack-lg">
    <PageHeader :title="tr('demo.resources')" :description="tr('demo.resourcesDescription')">
      <template #actions>
        <RouterLink class="btn btn-sm" to="/me/resources">{{ tr('demo.myResources') }}</RouterLink>
        <RouterLink class="btn btn-sm btn-primary" to="/resources/new"><Upload aria-hidden="true" />{{ tr('demo.upload') }}</RouterLink>
      </template>
    </PageHeader>
    <div class="stack">
      <div class="row filters">
        <SearchField v-model="q" :aria-label="tr('demo.searchResourcesLabel')" :placeholder="tr('demo.searchResourcesHint')" />
        <AppSelect v-model="course" class="select mini narrow-only" :aria-label="tr('demo.resourceCourse')"><option value="">{{ tr('demo.allCourses') }}</option><option v-for="c in courses" :key="c.id" :value="c.id">{{ c.name }}</option></AppSelect>
      </div>
      <div class="row-between">
        <div class="d-chips" role="group" :aria-label="tr('demo.resourceCategory')">
          <button class="d-chip" type="button" :aria-pressed="!cat" @click="cat = ''">{{ tr('demo.all') }}</button>
          <button v-for="c in resCategories" :key="c.id" class="d-chip" type="button" :aria-pressed="cat === c.id" @click="cat = c.id">{{ c.names['zh-CN'] }}</button>
        </div>
        <button class="btn btn-sm" type="button" :aria-pressed="selecting" @click="selecting = !selecting; picked = []">{{ selecting ? tr('demo.cancelSelection') : tr('demo.batchDownload') }}</button>
      </div>
      <FilterBar :items="activeFilters" :total="tr('demo.totalFiles', { p0: rows.length })" @clear-all="clearFilters" />
    </div>

    <div class="browse">
    <nav class="tree card" :aria-label="tr('demo.browseByCourse')">
      <button class="node" type="button" :aria-pressed="!course" @click="course = ''"><span>{{ tr('demo.allResources') }}</span><span class="subtle">{{ published.length }}</span></button>
      <button v-for="n in tree" :key="n.id" class="node" type="button" :aria-pressed="course === n.id" @click="course = n.id"><span class="truncate">{{ n.name }}</span><span class="subtle">{{ n.count }}</span></button>
    </nav>
    <div class="results">
    <div v-if="!rows.length" class="card empty stack">
      <p>{{ tr('demo.noMatchResources') }}</p>
      <RouterLink class="btn btn-sm btn-primary" style="justify-self:center" to="/resources/new">{{ tr('demo.uploadFirst') }}</RouterLink>
    </div>
    <ul v-else :key="`${cat}|${course}`" class="files d-list-in">
      <li v-for="r in rows" :key="r.id" class="card file">
        <label v-if="selecting" class="pick-wrap"><input v-model="picked" class="pick" type="checkbox" :value="r.id" :aria-label="tr('demo.selectItem', { p0: r.current!.metadata.title })"></label>
        <span class="thumb" :style="{ '--c': tints[r.current!.metadata.category_id] }" aria-hidden="true"><FileType2 v-if="r.current!.file!.filename.endsWith('docx')" /><FileText v-else /><i>{{ r.current!.file!.filename.split('.').at(-1) }}</i></span>
        <div class="group-body body">
          <RouterLink class="card-title" :to="`/resources/items/${r.id}`">{{ r.current!.metadata.title }}</RouterLink>
          <p class="muted small clamp-2">{{ r.current!.metadata.description }}</p>
          <p class="subtle">{{ courseName(r.current!.metadata.associations.course_id!) }} · {{ r.current!.category.names['zh-CN'] }} · {{ fileSize(r.current!.file!.size) }} · {{ relative(r.current!.created_at) }}</p>
        </div>
        <div v-if="!selecting" class="ops"><button class="btn btn-sm btn-icon desk" type="button" :aria-label="tr('demo.previewItem', { p0: r.current!.metadata.title })" @click="preview = r"><Eye aria-hidden="true" /></button><button class="btn btn-sm btn-icon desk" type="button" :aria-label="tr('demo.downloadItem', { p0: r.current!.metadata.title })" @click="download(r.current!.file!.filename)"><Download aria-hidden="true" /></button><FavButton :id="r.id" kind="resource" /><RowMore :label="tr('demo.moreActionsFor', { p0: r.current!.metadata.title })" :items="[{ label: tr('demo.preview'), icon: Eye, action: () => { preview = r } }, { label: tr('demo.download'), icon: Download, action: () => download(r.current!.file!.filename) }]" /></div>
      </li>
    </ul>
    </div>
    </div>
    <Drawer :open="!!preview" :title="preview?.current?.metadata.title ?? ''" :note="preview ? `${preview.current!.category.names['zh-CN']} · ${fileSize(preview.current!.file!.size)}` : ''" @close="preview = undefined">
      <div class="row-between"><div class="row"><button class="btn btn-sm btn-icon" type="button" :aria-label="tr('demo.prevPage')" :disabled="pageNo <= 1" @click="pageNo--"><ChevronLeft class="flip-rtl" aria-hidden="true" /></button><span class="subtle">{{ tr('demo.pageOf', { p0: pageNo, p1: pageCount }) }}</span><button class="btn btn-sm btn-icon" type="button" :aria-label="tr('demo.nextPage')" :disabled="pageNo >= pageCount" @click="pageNo++"><ChevronRight class="flip-rtl" aria-hidden="true" /></button></div><div class="row"><button class="btn btn-sm btn-icon" type="button" :aria-label="tr('demo.zoomOut')" :disabled="zoom <= 60" @click="zoom -= 20"><Minus aria-hidden="true" /></button><span class="subtle">{{ zoom }}%</span><button class="btn btn-sm btn-icon" type="button" :aria-label="tr('demo.zoomIn')" :disabled="zoom >= 140" @click="zoom += 20"><Plus aria-hidden="true" /></button></div></div>
      <div class="sheet-wrap"><div class="sheet" :style="{ width: `${zoom * 3.4}px` }" role="img" :aria-label="tr('demo.pagePreview', { p0: pageNo })"><b>{{ preview?.current?.metadata.title }}</b><small>{{ tr('demo.pageNo', { p0: pageNo }) }}</small><i v-for="n in 13" :key="n" :style="{ width: `${60 + ((n * 37 + pageNo * 13) % 40)}%` }" /></div></div>
      <p class="muted small">{{ preview?.current?.metadata.description }}</p>
      <template #footer><FavButton v-if="preview" :id="preview.id" kind="resource" text /><RouterLink v-if="preview" class="btn" :to="`/resources/items/${preview.id}`">{{ tr('demo.viewDetails') }}</RouterLink><button class="btn btn-primary" type="button" @click="download(preview!.current!.file!.filename)"><Download aria-hidden="true" />{{ tr('demo.download') }}</button></template>
    </Drawer>
    <Transition name="page">
      <div v-if="selecting && picked.length" class="bar">
        <span>{{ tr('demo.selectedCount', { p0: picked.length }) }}</span>
        <button class="btn btn-sm btn-primary" type="button" @click="batch">{{ tr('demo.packDownload') }}</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.filters { gap: .5rem; }
.mini { width: auto; min-height: 42px; padding-block: .375rem; border-radius: var(--pill); background-color: var(--surface); box-shadow: var(--shadow-card); font-size: .9375rem; flex: 0 1 13rem; }
.files { display: grid; gap: .875rem; grid-template-columns: minmax(0, 1fr); gap: .625rem; }
.file { display: flex; align-items: flex-start; gap: .875rem; padding: 1rem; transition: box-shadow .3s; }
.file:hover { box-shadow: var(--shadow-lift); }
.body { gap: .25rem; }
.thumb { position: relative; display: grid; flex: none; justify-items: center; align-content: center; gap: 1px; width: 52px; height: 64px; border-radius: 10px; background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); }
.thumb svg { width: 22px; height: 22px; }
.thumb i { color: color-mix(in srgb, var(--c) 62%, var(--label)); font-size: .625rem; font-style: normal; font-weight: 700; text-transform: uppercase; }
.ops { position: relative; display: flex; flex: none; gap: .25rem; }
@media (hover: hover) and (min-width: 761px) {
  .ops .btn { opacity: 0; transition: opacity .15s; }
  .file:hover .ops .btn, .file:focus-within .ops .btn, .ops .btn[aria-pressed="true"] { opacity: 1; }
}
@media (max-width: 760px) { .ops .desk { display: none; } }
@media (max-width: 640px) { .file { flex-wrap: nowrap; gap: .625rem; padding: .875rem; } .thumb { width: 38px; height: 48px; } .thumb svg { width: 18px; height: 18px; } .ops { gap: .125rem; } .file .body { flex: 1 1 0; min-width: 0; } }
.browse { display: grid; gap: 1rem; }
.results { min-width: 0; }
.tree { display: none; padding: .5rem; align-self: start; position: sticky; inset-block-start: 4.5rem; }
.node { display: flex; align-items: center; justify-content: space-between; gap: .5rem; width: 100%; min-height: 34px; padding: .25rem .625rem; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--label); font: inherit; font-size: .875rem; text-align: start; cursor: pointer; }
.node:hover { background: var(--fill); }
.node[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 550; }
@media (min-width: 1000px) { .browse { grid-template-columns: 14rem minmax(0, 1fr); } .tree { display: block; } .narrow-only { display: none; } }
.sheet-wrap { overflow: auto; padding: 1rem; border-radius: var(--radius-sm); background: var(--fill); }
.sheet { display: grid; gap: .5rem; max-width: none; margin-inline: auto; padding: 1.5rem; background: #fff; color: #1d1d1f; box-shadow: var(--shadow-card); }
.sheet small { color: #6e6e73; }
.sheet i { display: block; height: 6px; border-radius: 2px; background: #e5e5ea; }
.pick-wrap { display: flex; align-self: center; }
.bar { position: sticky; inset-block-end: calc(var(--tab-height) + 1rem); display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .625rem .75rem .625rem 1.25rem; border-radius: var(--pill); background: var(--glass); box-shadow: var(--shadow-float); backdrop-filter: blur(24px); }
@media (min-width: 761px) { .bar { inset-block-end: 1rem; } }
</style>
