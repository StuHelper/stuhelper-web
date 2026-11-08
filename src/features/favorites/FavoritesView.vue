<script setup lang="ts">
import { BookOpen, FileText, Folder, FolderPlus, Layers, MoreHorizontal, Pencil, Trash2, UserRound } from 'lucide-vue-next'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { usePaged } from '../../shared/composables/async'
import AppSelect from '../../shared/ui/AppSelect.vue'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import SearchField from '../../shared/ui/SearchField.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import { useAsync } from '../../shared/composables/async'
import { useFavoritesApi, type Favorite, type FavoriteKind, type FavoriteSort, type Folder as FolderRow } from './api'
import { rememberFavorite } from './state'

// The caller's favorites and folders. Titles are the snapshots the favorites module keeps,
// so the page works without content admission; details stay behind the original pages.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useFavoritesApi()

const folder = ref('')
const kind = ref<'all' | FavoriteKind>('all')
const q = ref('')
const query = ref('')
const sort = ref<FavoriteSort>('newest')

const folders = useAsync((signal) => api.allFolders(signal))
void folders.reload()
/** Refresh folder counts after a write without replacing the page with a skeleton. */
async function refreshFolders() {
  try {
    folders.data.value = await api.allFolders()
  } catch {
    // The counts stay as they were; the next full load shows the current values.
  }
}
const folderRows = computed(() => folders.data.value ?? [])
const total = computed(() => folderRows.value.reduce((sum, row) => sum + row.item_count, 0))
const defaultFolder = computed(() => folderRows.value.find((row) => row.is_default))
const folderName = (row: Pick<FolderRow, 'name' | 'is_default'>) => (row.is_default && !row.name ? t('favorites.defaultFolder') : row.name)
const selected = computed(() => folderRows.value.find((row) => row.id === folder.value))
const heading = computed(() => (selected.value ? folderName(selected.value) : t('favorites.all')))

const rows = usePaged<Favorite>(async (after, signal) => {
  const page = await api.items({ after, folder_id: folder.value || undefined, kind: kind.value === 'all' ? undefined : kind.value, q: query.value || undefined, sort: sort.value }, signal)
  return { items: page.items, next: page.next ?? '' }
})
watch([folder, kind, query, sort], () => void rows.reload(), { immediate: true })
// Searching waits for a short pause in typing so each keystroke does not send a request.
let typing: ReturnType<typeof setTimeout> | undefined
watch(q, (value) => {
  clearTimeout(typing)
  typing = setTimeout(() => { query.value = value.trim() }, 300)
})

const tabs = computed(() => ([['all', 'kindAll'], ['course', 'kindCourse'], ['teacher', 'kindTeacher'], ['resource', 'kindResource']] as const).map(([value, label]) => ({ value, label: t(`favorites.${label}`) })))
const links: Record<FavoriteKind, string> = { course: 'courses', teacher: 'teachers', resource: 'resources/items' }
const icons = { course: BookOpen, teacher: UserRound, resource: FileText }
const tiles: Record<FavoriteKind, string> = { course: 'var(--c-blue)', teacher: 'var(--c-purple)', resource: 'var(--c-orange)' }
const kindLabel = (value: FavoriteKind) => t(`favorites.${value === 'course' ? 'kindCourse' : value === 'teacher' ? 'kindTeacher' : 'kindResource'}`)
const target = (row: Favorite) => `/${links[row.kind]}/${encodeURIComponent(row.target_id)}`
const title = (row: Favorite) => row.title || t('favorites.untitled')
/** How long ago a favorite was saved, in the largest whole unit. */
function ago(at: string) {
  const seconds = Math.round((Date.parse(at) - Date.now()) / 1000)
  const units: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3600], ['minute', 60]]
  for (const [unit, size] of units) if (Math.abs(seconds) >= size) return format.value.relative(Math.trunc(seconds / size), unit)
  return format.value.relative(0, 'minute')
}
const folderOf = (id: string) => folderRows.value.find((row) => row.id === id)

// Creating and renaming use the same inline field in the folder list.
const folderNav = ref<HTMLElement>()
const allButton = ref<HTMLButtonElement>()
const editing = ref<'new' | 'rename' | ''>('')
const name = ref('')
const saving = ref(false)
const nameError = ref('')
const trimmed = computed(() => name.value.trim())
const nameTaken = computed(() => folderRows.value.some((row) => folderName(row) === trimmed.value && !(editing.value === 'rename' && row.id === folder.value)))
const nameValid = computed(() => !!trimmed.value && [...trimmed.value].length <= 20 && !nameTaken.value)
function focusInput() {
  void nextTick(() => {
    const field = folderNav.value?.querySelector<HTMLInputElement>('.folder-input')
    field?.focus()
    field?.select()
  })
}
function startEdit(mode: 'new' | 'rename') {
  editing.value = mode
  nameError.value = ''
  name.value = mode === 'rename' && selected.value ? folderName(selected.value) : ''
  focusInput()
}
async function saveEdit() {
  if (!nameValid.value || saving.value) return
  const mode = editing.value
  const current = selected.value
  if (mode === 'rename' && current && trimmed.value === folderName(current)) {
    editing.value = ''
    return
  }
  saving.value = true
  try {
    const saved = mode === 'new'
      ? await api.createFolder({ name: trimmed.value }, crypto.randomUUID())
      : await api.renameFolder(current!.id, { name: trimmed.value, revision: current!.revision }, crypto.randomUUID())
    toast(t(mode === 'new' ? 'favorites.folderCreated' : 'favorites.folderRenamed'))
    editing.value = ''
    await refreshFolders()
    folder.value = saved.id
  } catch (failure) {
    // A taken name and a stale revision both return 409; keep the field open either way.
    nameError.value = errorCode(failure) === 'conflict' ? t('favorites.folderNameTaken') : errorText(errorCode(failure))
    focusInput()
  } finally {
    saving.value = false
  }
}
// After the keyboard ends editing, focus returns to the row. A click elsewhere keeps its new focus.
function restoreFocus() {
  void nextTick(() => { (folderNav.value?.querySelector<HTMLElement>('.folder[aria-pressed="true"]') ?? allButton.value)?.focus() })
}
async function editKeydown(event: KeyboardEvent) {
  // While an input method is composing, Enter confirms a candidate and Escape cancels it.
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    await saveEdit()
    if (!editing.value) restoreFocus()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    editing.value = ''
    restoreFocus()
  }
}
function editBlur() {
  if (!editing.value || saving.value) return
  if (nameValid.value) void saveEdit()
  else editing.value = ''
}
async function removeFolder() {
  const current = selected.value
  if (!current || current.is_default) return
  try {
    await api.deleteFolder(current.id, { revision: current.revision }, crypto.randomUUID())
    folder.value = ''
    toast(t('favorites.folderDeleted', { p0: folderName(current), p1: defaultFolder.value ? folderName(defaultFolder.value) : t('favorites.defaultFolder') }))
    await refreshFolders()
  } catch (failure) {
    toast(errorText(errorCode(failure)))
  }
}
// On phones the folder list scrolls sideways; keep the selected folder's menu button in view.
watch(folder, () => { folderNav.value?.querySelector('.folder-more')?.closest('.folder-row')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, { flush: 'post' })
// Menu items either hide the trigger or move focus into the rename field, so focus is placed here.
function menuClosed(event: Event) {
  if (editing.value) {
    event.preventDefault()
    focusInput()
  } else if (!folder.value) {
    event.preventDefault()
    allButton.value?.focus()
  }
}

const working = shallowRef(new Set<string>())
async function update(row: Favorite, work: () => Promise<void>) {
  if (working.value.has(row.id)) return
  working.value = new Set([...working.value, row.id])
  try {
    await work()
  } catch (failure) {
    toast(errorText(errorCode(failure)))
    void rows.reload()
  } finally {
    working.value = new Set([...working.value].filter((id) => id !== row.id))
    void refreshFolders()
  }
}
function move(row: Favorite, to: FolderRow) {
  void update(row, async () => {
    const moved = await api.move(row.id, { folder_id: to.id, revision: row.revision }, crypto.randomUUID())
    replace(row, folder.value && folder.value !== to.id ? undefined : moved)
    toast(t('favorites.movedTo', { p0: folderName(to) }), () => void update(moved, async () => {
      await api.move(moved.id, { folder_id: row.folder_id, revision: moved.revision }, crypto.randomUUID())
      void rows.reload()
    }))
  })
}
function remove(row: Favorite) {
  void update(row, async () => {
    await api.remove(row.id, { revision: row.revision }, crypto.randomUUID())
    replace(row, undefined)
    rememberFavorite(row.kind, row.target_id, null)
    // Undo saves the target again in its previous folder.
    toast(t('favorites.removed'), () => void update(row, async () => {
      const restored = await api.add({ kind: row.kind, target_id: row.target_id, folder_id: row.folder_id }, crypto.randomUUID())
      rememberFavorite(row.kind, row.target_id, restored)
      void rows.reload()
    }))
  })
}
function replace(row: Favorite, next: Favorite | undefined) {
  rows.items.value = next ? rows.items.value.map((item) => (item.id === row.id ? next : item)) : rows.items.value.filter((item) => item.id !== row.id)
}
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :title="t('favorites.title')"
      back="/me"
      :back-label="t('favorites.mine')"
      :description="folders.data.value ? t('favorites.summary', { p0: format.number(total), p1: format.number(folderRows.length) }) : ''"
    />
    <AsyncState
      :status="folders.status.value"
      :error="folders.error.value"
      @retry="folders.reload()"
    >
      <div class="layout">
        <aside class="side">
          <nav
            ref="folderNav"
            class="folders"
            :aria-label="t('favorites.folders')"
          >
            <button
              ref="allButton"
              class="folder"
              type="button"
              :aria-pressed="!folder"
              @click="folder = ''"
            >
              <Layers aria-hidden="true" /><span class="truncate">{{ t('favorites.all') }}</span><small>{{ format.number(total) }}</small>
            </button>
            <div
              v-for="x in folderRows"
              :key="x.id"
              class="folder-row"
            >
              <div
                v-if="editing === 'rename' && folder === x.id"
                class="folder folder-editing"
              >
                <Folder aria-hidden="true" />
                <input
                  v-model="name"
                  class="folder-input"
                  maxlength="20"
                  :aria-label="t('favorites.renameFolder', { p0: folderName(x) })"
                  :aria-invalid="nameTaken || !!nameError"
                  :aria-describedby="nameTaken || nameError ? 'folder-name-error' : undefined"
                  :disabled="saving"
                  @keydown="editKeydown"
                  @blur="editBlur"
                >
              </div>
              <button
                v-else
                class="folder"
                type="button"
                :aria-pressed="folder === x.id"
                @click="folder = x.id"
              >
                <Folder aria-hidden="true" /><span class="truncate">{{ folderName(x) }}</span><small>{{ format.number(x.item_count) }}</small>
              </button>
              <DropdownMenuRoot
                v-if="folder === x.id && editing !== 'rename'"
                :modal="false"
              >
                <DropdownMenuTrigger
                  class="btn btn-sm btn-icon plain folder-more"
                  :aria-label="t('favorites.manageFolderItem', { p0: folderName(x) })"
                  :title="t('favorites.manageFolder')"
                >
                  <MoreHorizontal aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent
                    class="menu"
                    align="start"
                    :side-offset="6"
                    @close-auto-focus="menuClosed"
                  >
                    <DropdownMenuItem
                      class="menu-item"
                      @select="startEdit('rename')"
                    >
                      <Pencil aria-hidden="true" />{{ t('favorites.rename') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-if="!x.is_default"
                      class="menu-item"
                      @select="removeFolder"
                    >
                      <Trash2 aria-hidden="true" />{{ t('favorites.deleteFolder') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </div>
            <div
              v-if="editing === 'new'"
              class="folder-row"
            >
              <div class="folder folder-editing">
                <FolderPlus aria-hidden="true" />
                <input
                  v-model="name"
                  class="folder-input"
                  maxlength="20"
                  :aria-label="t('favorites.newFolderName')"
                  :aria-invalid="nameTaken || !!nameError"
                  :aria-describedby="nameTaken || nameError ? 'folder-name-error' : undefined"
                  :placeholder="t('favorites.folderName')"
                  :disabled="saving"
                  @keydown="editKeydown"
                  @blur="editBlur"
                >
              </div>
            </div>
            <button
              v-else
              class="folder add"
              type="button"
              @click="startEdit('new')"
            >
              <FolderPlus aria-hidden="true" /><span>{{ t('favorites.newFolder') }}</span>
            </button>
          </nav>
          <p
            v-if="editing && (nameTaken || nameError)"
            id="folder-name-error"
            class="error small"
            role="alert"
          >
            {{ nameTaken ? t('favorites.folderNameTaken') : nameError }}
          </p>
        </aside>

        <section
          class="main stack"
          :aria-label="heading"
        >
          <div class="row-between">
            <h2 class="d-title">
              {{ heading }}
            </h2>
            <AppSelect
              v-model="sort"
              class="select sort"
              :aria-label="t('favorites.sort')"
            >
              <option value="newest">
                {{ t('favorites.newest') }}
              </option>
              <option value="name">
                {{ t('favorites.byName') }}
              </option>
            </AppSelect>
          </div>
          <div class="toolbar">
            <TabBar
              v-model="kind"
              :tabs="tabs"
              :label="t('favorites.kind')"
              id-prefix="favorite"
            />
            <SearchField
              v-model="q"
              maxlength="100"
              :aria-label="t('favorites.search')"
              :placeholder="t('favorites.search')"
            />
          </div>

          <PagedState
            :status="rows.status.value"
            :error="rows.error.value"
            :count="rows.items.value.length"
            :next="rows.next.value"
            :appending="rows.appending.value"
            @retry="rows.reload()"
            @more="rows.loadMore()"
          >
            <template #empty>
              <div class="card empty stack">
                <Folder
                  class="empty-icon"
                  aria-hidden="true"
                />
                <template v-if="query">
                  <p>{{ t('favorites.noMatch', { p0: query }) }}</p>
                  <button
                    class="btn btn-sm center"
                    type="button"
                    @click="q = ''; query = ''"
                  >
                    {{ t('favorites.clearSearch') }}
                  </button>
                </template>
                <template v-else>
                  <p>{{ selected ? t('favorites.folderEmpty', { p0: heading }) : t('favorites.empty') }}</p>
                  <p class="subtle">
                    {{ t('favorites.emptyHint') }}
                  </p>
                  <RouterLink
                    class="btn btn-sm btn-primary center"
                    to="/courses"
                  >
                    {{ t('favorites.browseCourses') }}
                  </RouterLink>
                </template>
              </div>
            </template>
            <TransitionGroup
              tag="ul"
              name="fav"
              class="cards"
            >
              <li
                v-for="f in rows.items.value"
                :key="f.id"
                class="card fav"
              >
                <div class="head">
                  <span
                    class="icon-tile"
                    :style="{ '--tile': tiles[f.kind] }"
                  ><component
                    :is="icons[f.kind]"
                    aria-hidden="true"
                  /></span>
                  <div class="group-body">
                    <RouterLink
                      class="card-title"
                      :to="target(f)"
                    >
                      {{ title(f) }}
                    </RouterLink>
                    <span class="subtle truncate">{{ kindLabel(f.kind) }}</span>
                  </div>
                  <DropdownMenuRoot :modal="false">
                    <DropdownMenuTrigger
                      class="btn btn-sm btn-icon plain"
                      :aria-label="t('favorites.manageItem', { p0: title(f) })"
                      :disabled="working.has(f.id)"
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuContent
                        class="menu"
                        align="end"
                        :side-offset="6"
                      >
                        <DropdownMenuLabel class="menu-label">
                          {{ t('favorites.moveTo') }}
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          v-for="x in folderRows.filter((y) => y.id !== f.folder_id)"
                          :key="x.id"
                          class="menu-item"
                          @select="move(f, x)"
                        >
                          <Folder aria-hidden="true" />{{ folderName(x) }}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator class="menu-sep" />
                        <DropdownMenuItem
                          class="menu-item"
                          @select="remove(f)"
                        >
                          <Trash2 aria-hidden="true" />{{ t('favorites.remove') }}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenuPortal>
                  </DropdownMenuRoot>
                </div>
                <div class="foot">
                  <span class="subtle truncate"><template v-if="!folder && folderOf(f.folder_id)">{{ folderName(folderOf(f.folder_id)!) }} · </template>{{ t('favorites.savedAt', { p0: ago(f.created_at) }) }}</span>
                  <RouterLink
                    class="btn btn-sm"
                    :to="target(f)"
                  >
                    {{ t('favorites.viewDetails') }}
                  </RouterLink>
                </div>
              </li>
            </TransitionGroup>
          </PagedState>
        </section>
      </div>
    </AsyncState>
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
/* The selected folder shows its menu button where the count was. */
.folder[aria-pressed="true"]:has(+ .folder-more) { padding-inline-end: 2.25rem; }
.folder[aria-pressed="true"]:has(+ .folder-more) small { display: none; }
.folder-editing { width: 11rem; background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--accent); cursor: text; }
.folder-editing:hover { background: var(--surface); }
.folder-editing svg { color: var(--accent); }
.folder-editing:has([aria-invalid="true"]) { box-shadow: inset 0 0 0 1.5px var(--danger); }
.folder-input { flex: 1; width: 100%; min-width: 0; padding: 0; border: 0; outline: 0; background: transparent; color: var(--label); font: inherit; }
.btn.folder-more { position: absolute; inset-block-start: 50%; inset-inline-end: .25rem; width: 30px; min-height: 30px; margin-block-start: -15px; color: var(--accent); }
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
.toolbar .d-search :deep(input) { height: 38px; font-size: .9375rem; }
.cards { position: relative; display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr)); }
.fav { display: grid; gap: .75rem; grid-template-rows: 1fr auto; padding: 1rem; transition: box-shadow .3s; }
.fav:hover { box-shadow: var(--shadow-lift); }
.head { display: flex; align-items: flex-start; gap: .75rem; min-width: 0; }
.foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
.foot > .subtle { flex: 1 1 6rem; min-width: 0; }
.empty-icon { justify-self: center; width: 2rem; height: 2rem; color: var(--label-3); }
.center { justify-self: center; }
.fav-move { transition: transform .35s var(--ease-out); }
.fav-enter-active { transition: opacity .25s, transform .25s; }
.fav-leave-active { position: absolute; opacity: 0; transition: opacity .15s; }
.fav-enter-from { opacity: 0; transform: scale(.97); }
@media (prefers-reduced-motion: reduce) { .fav-move, .fav-enter-active, .fav-leave-active { transition: none; } }
@media (min-width: 900px) {
  .layout { grid-template-columns: 13rem minmax(0, 1fr); gap: 1.5rem; }
  .side { position: sticky; inset-block-start: calc(var(--nav-height) + 1rem); align-self: start; }
  .folders { flex-direction: column; overflow: visible; }
  .folder-row { display: flex; width: 100%; }
  .folder { width: 100%; background: transparent; border-radius: var(--radius-sm); }
  .folder span { flex: 1; }
}
</style>
