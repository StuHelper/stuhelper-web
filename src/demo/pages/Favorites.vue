<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { BookOpen, Eye, FileText, Folder, FolderPlus, Layers, MoreHorizontal, Pencil, Search, Trash2 } from 'lucide-vue-next'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SearchField from './SearchField.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { courseSeeds, departments, resources, teachers } from '../data'
import { favorites, fileSize, folders, levelsOf, relative, toast, toggleFavorite, type FavKind } from '../store'
import FavButton from './FavButton.vue'
import Level from './Level.vue'
import QuickView from './QuickView.vue'
const { t: tr } = useI18n()

type Row = (typeof favorites)[number]
const folder = ref(''); const kind = ref('all'); const q = ref(''); const sort = ref<'new' | 'name'>('new')
const quick = ref<{ kind: 'course' | 'teacher'; id: string }>()
const dept = (id?: string) => departments.find((d) => d.id === id)?.name ?? ''
const palette = ['var(--c-blue)', 'var(--c-purple)', 'var(--c-orange)', 'var(--c-green)', 'var(--c-pink)', 'var(--c-indigo)', 'var(--c-cyan)']
// 头像上是白字，底色压暗后才有足够对比度。
const tint = (id: string) => `color-mix(in srgb, ${palette[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % palette.length]} 72%, black)`
const fileTints: Record<string, string> = { exam: 'var(--c-red)', note: 'var(--c-orange)', slide: 'var(--c-blue)', solution: 'var(--c-green)' }

function view(row: Pick<Row, 'kind' | 'id'>) {
  if (row.kind === 'course') { const c = courseSeeds.find((r) => r[0] === row.id); return { title: c?.[1] ?? '', sub: c ? tr('demo.deptCredits', { p0: dept(c[3]), p1: c[6] }) : '', to: `/courses/${row.id}`, label: tr('demo.courses') } }
  if (row.kind === 'teacher') { const t = teachers.find((r) => r.id === row.id) as { name: string; department_id?: string; biography?: string } | undefined; return { title: t?.name ?? '', sub: dept(t?.department_id), to: `/teachers/${row.id}`, label: tr('demo.teachers'), text: t?.biography } }
  const v = resources.find((r) => r.id === row.id)?.current
  return { title: v?.metadata.title ?? '', sub: v ? `${v.category.names['zh-CN']} · ${fileSize(v.file!.size)}` : '', to: `/resources/items/${row.id}`, label: tr('demo.resourcesShort'), text: v?.metadata.description, ext: v?.file?.filename.split('.').at(-1), cat: v?.metadata.category_id }
}
const inFolder = computed(() => favorites.filter((f) => !folder.value || f.folder === folder.value))
const rows = computed(() => {
  const s = q.value.trim().toLowerCase()
  const list = inFolder.value.filter((f) => (kind.value === 'all' || f.kind === kind.value) && (!s || view(f).title.toLowerCase().includes(s)))
  return [...list].sort((a, b) => (sort.value === 'name' ? view(a).title.localeCompare(view(b).title, 'zh-CN') : b.at.localeCompare(a.at)))
})
const tabs = computed(() => ([['all', tr('demo.all')], ['course', tr('demo.courses')], ['teacher', tr('demo.teachers')], ['resource', tr('demo.resourcesShort')]] as const).map(([value, label]) => ({ value, label: `${label} ${inFolder.value.filter((f) => value === 'all' || f.kind === value).length}` })))
const count = (name: string) => favorites.filter((f) => f.folder === name).length
const heading = computed(() => folder.value || tr('demo.allFavorites'))
const defaultFolder = computed(() => folders.value[0]!)

// 新建和重命名共用侧栏里的同一个输入框。
const folderNav = ref<HTMLElement>(); const allButton = ref<HTMLButtonElement>()
const editing = ref<'new' | 'rename' | ''>(''); const name = ref('')
const nameTaken = computed(() => folders.value.includes(name.value.trim()) && name.value.trim() !== (editing.value === 'rename' ? folder.value : ''))
const nameValid = computed(() => !!name.value.trim() && !nameTaken.value)
function focusInput() { void nextTick(() => { const el = folderNav.value?.querySelector<HTMLInputElement>('.folder-input'); el?.focus(); el?.select() }) }
function startEdit(mode: 'new' | 'rename') { editing.value = mode; name.value = mode === 'rename' ? folder.value : ''; focusInput() }
function saveEdit() {
  const text = name.value.trim()
  if (!nameValid.value) return
  if (editing.value === 'new') { folders.value.push(text); toast(tr('demo.folderCreated')) }
  else if (text !== folder.value) { const old = folder.value; folders.value = folders.value.map((x) => (x === old ? text : x)); favorites.forEach((f) => { if (f.folder === old) f.folder = text }); toast(tr('demo.folderRenamed')) }
  folder.value = text; editing.value = ''
}
// 键盘结束编辑后，焦点回到这一行。点到别处时焦点已经去了新位置，不再移动。
function restoreFocus() { void nextTick(() => { (folderNav.value?.querySelector<HTMLElement>('.folder[aria-pressed="true"]') ?? allButton.value)?.focus() }) }
function editKeydown(event: KeyboardEvent) {
  // 输入法组字时，回车用于确认候选词，Esc 用于取消组字。
  if (event.isComposing) return
  if (event.key === 'Enter') { event.preventDefault(); if (nameValid.value) { saveEdit(); restoreFocus() } }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); editing.value = ''; restoreFocus() }
}
function editBlur() {
  if (!editing.value) return
  if (nameValid.value) saveEdit()
  else editing.value = ''
}
function removeFolder() {
  const old = folder.value; const moved = favorites.filter((f) => f.folder === old); const at = folders.value.indexOf(old)
  moved.forEach((f) => { f.folder = defaultFolder.value })
  folders.value = folders.value.filter((x) => x !== old); folder.value = ''
  toast(tr('demo.folderDeleted', { p0: old, p1: defaultFolder.value }), () => { folders.value.splice(at, 0, old); moved.forEach((f) => { f.folder = old }); folder.value = old })
}
// 手机上收藏夹横向滚动，选中后要把管理按钮完整露出来。
watch(folder, () => { folderNav.value?.querySelector('.folder-more')?.closest('.folder-row')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, { flush: 'post' })
// 菜单项会让触发按钮消失或把焦点交给重命名输入框，这两种情况不能按默认方式把焦点还给触发按钮。
function menuClosed(event: Event) {
  if (editing.value) { event.preventDefault(); focusInput() }
  else if (!folder.value) { event.preventDefault(); allButton.value?.focus() }
}
function move(row: Row, target: string) { const old = row.folder; row.folder = target; toast(tr('demo.movedTo', { p0: target }), () => { row.folder = old }) }
</script>

<template>
  <div class="stack-lg">
    <PageHeader :title="tr('demo.favorites')" back="/me" :back-label="tr('demo.mine')" :description="tr('demo.favoriteSummary', { p0: favorites.length, p1: folders.length })" />
    <div class="layout">
      <aside class="side">
        <nav ref="folderNav" class="folders" :aria-label="tr('demo.folders')">
          <button ref="allButton" class="folder" type="button" :aria-pressed="!folder" @click="folder = ''"><Layers aria-hidden="true" /><span class="truncate">{{ tr('demo.allFavorites') }}</span><small>{{ favorites.length }}</small></button>
          <div v-for="x in folders" :key="x" class="folder-row">
            <div v-if="editing === 'rename' && folder === x" class="folder folder-editing"><Folder aria-hidden="true" /><input v-model="name" class="folder-input" maxlength="20" :aria-label="tr('demo.renameFolder', { p0: x })" :aria-invalid="nameTaken" @keydown="editKeydown" @blur="editBlur"></div>
            <button v-else class="folder" type="button" :aria-pressed="folder === x" @click="folder = x"><Folder aria-hidden="true" /><span class="truncate">{{ x }}</span><small>{{ count(x) }}</small></button>
            <DropdownMenuRoot v-if="folder === x && editing !== 'rename'" :modal="false">
              <DropdownMenuTrigger class="btn btn-sm btn-icon plain folder-more" :aria-label="tr('demo.manageFolderItem', { p0: x })" :title="tr('demo.manageFolder')"><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
              <DropdownMenuPortal><DropdownMenuContent class="menu" align="start" :side-offset="6" @close-auto-focus="menuClosed">
                <DropdownMenuItem class="menu-item" @select="startEdit('rename')"><Pencil aria-hidden="true" />{{ tr('demo.rename') }}</DropdownMenuItem>
                <DropdownMenuItem v-if="x !== defaultFolder" class="menu-item" @select="removeFolder"><Trash2 aria-hidden="true" />{{ tr('demo.deleteFolder') }}</DropdownMenuItem>
              </DropdownMenuContent></DropdownMenuPortal>
            </DropdownMenuRoot>
          </div>
          <div v-if="editing === 'new'" class="folder-row"><div class="folder folder-editing"><FolderPlus aria-hidden="true" /><input v-model="name" class="folder-input" maxlength="20" :aria-label="tr('demo.newFolderName')" :aria-invalid="nameTaken" :placeholder="tr('demo.folderName')" @keydown="editKeydown" @blur="editBlur"></div></div>
          <button v-else class="folder add" type="button" @click="startEdit('new')"><FolderPlus aria-hidden="true" /><span>{{ tr('demo.newFolder') }}</span></button>
        </nav>
        <p v-if="editing && nameTaken" class="error small" role="alert">{{ tr('demo.folderNameTaken') }}</p>
      </aside>

      <section class="main stack" :aria-label="heading">
        <div class="row-between">
          <h2 class="d-title">{{ heading }}</h2>
          <AppSelect v-model="sort" class="select sort" :aria-label="tr('demo.sort')"><option value="new">{{ tr('demo.recentlySaved') }}</option><option value="name">{{ tr('demo.byName') }}</option></AppSelect>
        </div>
        <div class="toolbar">
          <TabBar v-model="kind" :tabs="tabs" :label="tr('demo.favoriteKind')" id-prefix="favorite" />
          <SearchField v-model="q" :aria-label="tr('demo.searchFavorites')" :placeholder="tr('demo.searchFavorites')" />
        </div>

        <TransitionGroup v-if="rows.length" tag="ul" name="fav" class="cards">
          <li v-for="f in rows" :key="f.kind + f.id" class="card fav">
            <div class="head">
              <span v-if="f.kind === 'teacher'" class="face" :style="{ background: tint(f.id) }" aria-hidden="true">{{ view(f).title[0] }}</span>
              <span v-else-if="f.kind === 'course'" class="icon-tile" style="--tile:var(--c-blue)"><BookOpen aria-hidden="true" /></span>
              <span v-else class="file" :style="{ '--c': fileTints[view(f).cat ?? ''] ?? 'var(--c-blue)' }" aria-hidden="true"><FileText /><i>{{ view(f).ext }}</i></span>
              <div class="group-body"><RouterLink class="card-title" :to="view(f).to">{{ view(f).title }}</RouterLink><span class="subtle truncate">{{ view(f).sub }}</span></div>
              <DropdownMenuRoot :modal="false">
                <DropdownMenuTrigger class="btn btn-sm btn-icon plain" :aria-label="tr('demo.manageItem', { p0: view(f).title })"><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
                <DropdownMenuPortal><DropdownMenuContent class="menu" align="end" :side-offset="6">
                  <DropdownMenuLabel class="menu-label">{{ tr('demo.moveToFolder') }}</DropdownMenuLabel>
                  <DropdownMenuItem v-for="x in folders.filter((y) => y !== f.folder)" :key="x" class="menu-item" @select="move(f, x)"><Folder aria-hidden="true" />{{ x }}</DropdownMenuItem>
                  <DropdownMenuSeparator class="menu-sep" />
                  <DropdownMenuItem class="menu-item" @select="toggleFavorite(f.kind as FavKind, f.id)"><Trash2 aria-hidden="true" />{{ tr('demo.unfavorite') }}</DropdownMenuItem>
                </DropdownMenuContent></DropdownMenuPortal>
              </DropdownMenuRoot>
            </div>
            <div v-if="f.kind === 'course'" class="dims">
              <span><small>{{ tr('demo.recommendation') }}</small><Level dim="recommendation" :level="levelsOf('course', f.id)[0]!" /></span>
              <span><small>{{ tr('demo.difficulty') }}</small><Level dim="difficulty" :level="levelsOf('course', f.id)[2]!" /></span>
              <span><small>{{ tr('demo.dimWorkload') }}</small><Level dim="workload" :level="levelsOf('course', f.id)[3]!" /></span>
            </div>
            <p v-else class="muted small clamp-2 text">{{ view(f).text }}</p>
            <div class="foot">
              <span class="subtle truncate"><template v-if="!folder">{{ f.folder }} · </template>{{ tr('demo.savedAt', { p0: relative(f.at) }) }}</span>
              <div class="row actions">
                <FavButton :id="f.id" :kind="f.kind" />
                <button v-if="f.kind !== 'resource'" class="btn btn-sm" type="button" @click="quick = { kind: f.kind as 'course' | 'teacher', id: f.id }"><Eye aria-hidden="true" />{{ tr('demo.quickView') }}</button>
                <RouterLink v-else class="btn btn-sm" :to="view(f).to">{{ tr('demo.viewDetails') }}</RouterLink>
              </div>
            </div>
          </li>
        </TransitionGroup>
        <div v-else class="card empty stack">
          <Folder class="empty-icon" aria-hidden="true" />
          <template v-if="q.trim()"><p>{{ tr('demo.noMatchFor', { p0: q.trim() }) }}</p><button class="btn btn-sm center" type="button" @click="q = ''">{{ tr('demo.clearSearch') }}</button></template>
          <template v-else><p>{{ folder ? tr('demo.folderEmpty', { p0: folder }) : tr('demo.noFavorites') }}</p><p class="subtle">{{ tr('demo.favoritesEmptyHint') }}</p><RouterLink class="btn btn-sm btn-primary center" to="/courses">{{ tr('demo.browseCourses') }}</RouterLink></template>
        </div>
      </section>
    </div>
    <QuickView :id="quick?.id" :kind="quick?.kind ?? 'course'" @close="quick = undefined" />
  </div>
</template>

<style scoped>
.layout { display: grid; gap: 1rem; }
.side { display: grid; gap: .5rem; min-width: 0; align-content: start; }
.folders { display: flex; gap: .375rem; overflow-x: auto; scrollbar-width: none; }
.folder { display: inline-flex; flex: none; align-items: center; gap: .5rem; min-height: 38px; padding: .25rem .75rem; border: 0; border-radius: var(--pill); background: var(--fill); color: var(--label); font: inherit; font-size: .875rem; text-align: start; cursor: pointer; transition: background-color .15s, color .15s; }
.folder svg { flex: none; width: 1rem; height: 1rem; color: var(--label-3); }
.folder small { color: var(--label-3); font-size: .75rem; font-variant-numeric: tabular-nums; }
.folder:hover { background: var(--fill-strong); }
.folder-row { position: relative; display: inline-flex; flex: none; min-width: 0; }
/* 选中后，数量的位置换成管理菜单按钮。 */
.folder[aria-pressed="true"]:has(+ .folder-more) { padding-inline-end: 2.25rem; }
.folder[aria-pressed="true"]:has(+ .folder-more) small { display: none; }
.folder-editing { width: 11rem; background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--accent); cursor: text; }
.folder-editing:hover { background: var(--surface); }
.folder-editing svg { color: var(--accent); }
.folder-editing:has([aria-invalid="true"]) { box-shadow: inset 0 0 0 1.5px var(--danger); }
.folder-input { flex: 1; width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: var(--label); font: inherit; }
.btn.folder-more { position: absolute; inset-block-start: 50%; inset-inline-end: .25rem; width: 30px; min-height: 30px; margin-block-start: -15px; color: var(--accent); animation: d-fade .15s; }
.folder[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); font-weight: 550; }
.folder[aria-pressed="true"] svg, .folder[aria-pressed="true"] small { color: var(--accent); }
.add { color: var(--label-2); }
.error { flex-basis: 100%; color: var(--danger); }
.main { min-width: 0; }
.plain { flex: none; background: transparent; color: var(--label-2); }
.plain:hover { background: var(--fill); }
.sort { width: auto; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: .625rem; }
.toolbar .d-search { flex: 1 1 12rem; }
.toolbar .d-search input { height: 38px; font-size: .9375rem; }
.cards { position: relative; display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); }
.fav { display: grid; gap: .75rem; grid-template-rows: auto 1fr auto; padding: 1rem; transition: box-shadow .3s; }
.fav:hover { box-shadow: var(--shadow-lift); }
.head { display: flex; align-items: flex-start; gap: .75rem; min-width: 0; }
.face { display: grid; flex: none; place-items: center; width: 40px; height: 40px; border-radius: 50%; color: #fff; font-weight: 600; }
.file { display: grid; flex: none; justify-items: center; align-content: center; width: 40px; height: 48px; border-radius: 9px; background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); }
.file svg { width: 18px; height: 18px; }
.file i { font-size: .5625rem; font-style: normal; font-weight: 700; text-transform: uppercase; }
.dims { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr); gap: .5rem; align-self: start; padding: .5rem .75rem; border-radius: var(--radius-sm); background: var(--fill); }
.dims > span { display: grid; gap: .125rem; min-width: 0; }
.dims small { color: var(--label-3); font-size: .75rem; }
.text { align-self: start; }
.foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
.foot > .subtle { flex: 1 1 6rem; min-width: 0; }
.actions { flex-wrap: nowrap; gap: .25rem; }
.empty-icon { justify-self: center; width: 2rem; height: 2rem; color: var(--label-3); }
.center { justify-self: center; }
.fav-move { transition: transform .35s var(--ease-out); }
.fav-enter-active { transition: opacity .25s, transform .25s; }
.fav-leave-active { position: absolute; opacity: 0; transition: opacity .15s; }
.fav-enter-from { opacity: 0; transform: scale(.97); }
@media (min-width: 900px) {
  .layout { grid-template-columns: 13rem minmax(0, 1fr); gap: 1.5rem; }
  .side { position: sticky; inset-block-start: calc(var(--nav-height) + 1rem); align-self: start; }
  .folders { flex-direction: column; overflow: visible; }
  .folder-row { display: flex; width: 100%; }
  .folder { width: 100%; background: transparent; border-radius: var(--radius-sm); }
  .folder span { flex: 1; }
}
</style>
