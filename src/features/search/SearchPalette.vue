<script setup lang="ts">
import { BookOpen, FileText, FolderOpen, GraduationCap, History, Search } from 'lucide-vue-next'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { errorCode } from '../../shared/api/errors'
import { recentPages } from '../../shared/recent'
import { useErrorText } from '../../shared/ui/messages'
import { useAccess } from '../account/access'
import { targetRoute, useSearchApi, type SearchItem, type SearchKind } from './api'

// Site search opened with Ctrl+K or the navigation button. With no query it
// offers recently viewed pages; results come from the search service and only
// include what the viewer may currently read.
const { t } = useI18n()
const errorText = useErrorText()
const router = useRouter()
const access = useAccess()
const api = useSearchApi()
const open = ref(false)
const q = ref('')
const active = ref(0)
const results = shallowRef<SearchItem[]>([])
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const failure = ref('')
const icons: Record<SearchKind, Component> = { course: BookOpen, teacher: GraduationCap, review: FileText, resource: FolderOpen }
const verified = computed(() => access.state.value === 'verified')
// Key names are not translated; they match the keyboard.
const hotkeyLabel = 'Ctrl K'

interface Hit { to: string; title: string; kind: string; icon: Component }
const hits = computed<Hit[]>(() => {
  if (!q.value.trim()) return recentPages().map((page) => ({ to: page.path, title: page.title, kind: t('search.recent'), icon: History }))
  return results.value.map((item) => ({ to: targetRoute(item.target), title: item.title, kind: t(`search.kinds.${item.target.kind}`), icon: icons[item.target.kind] }))
})

let controller: AbortController | undefined
let timer: ReturnType<typeof setTimeout> | undefined
function cancel() {
  controller?.abort()
  clearTimeout(timer)
}
watch(q, (value) => {
  active.value = 0
  cancel()
  const text = value.trim()
  if (!text || !verified.value) {
    results.value = []
    status.value = 'idle'
    return
  }
  status.value = 'loading'
  // Wait for a pause in typing so each keystroke does not become a request.
  timer = setTimeout(async () => {
    controller = new AbortController()
    try {
      results.value = (await api.search(text, '', '', controller.signal, 8)).items
      status.value = 'ready'
    } catch (error) {
      if (controller.signal.aborted) return
      failure.value = errorCode(error)
      status.value = 'error'
    }
  }, 250)
})
watch(open, (value) => {
  if (value) {
    q.value = ''
    active.value = 0
  } else cancel()
})

function go(to?: string) {
  if (!to) return
  open.value = false
  void router.push(to)
}
function submit() {
  const hit = hits.value[active.value]
  if (hit && (status.value === 'ready' || !q.value.trim())) return go(hit.to)
  if (q.value.trim()) go(`/search?q=${encodeURIComponent(q.value.trim())}`)
}
function move(step: number) {
  const count = hits.value.length
  if (count) active.value = (active.value + step + count) % count
}
function hotkey(event: KeyboardEvent) {
  if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    open.value = true
  }
}
onMounted(() => window.addEventListener('keydown', hotkey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', hotkey)
  cancel()
})
</script>

<template>
  <button
    class="btn btn-icon trigger"
    type="button"
    :aria-label="t('search.open')"
    :title="t('search.hotkey')"
    @click="open = true"
  >
    <Search aria-hidden="true" /><span class="trigger-field"><span class="truncate">{{ t('search.placeholderShort') }}</span><kbd>{{ hotkeyLabel }}</kbd></span>
  </button>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="palette-overlay" />
      <DialogContent
        class="palette"
        aria-describedby=""
      >
        <DialogTitle class="visually-hidden">
          {{ t('search.title') }}
        </DialogTitle>
        <div class="field-row">
          <Search aria-hidden="true" />
          <input
            v-model="q"
            type="search"
            :placeholder="t('search.placeholder')"
            :aria-label="t('search.title')"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            :aria-activedescendant="hits.length ? `palette-${active}` : undefined"
            maxlength="200"
            @keydown.down.prevent="move(1)"
            @keydown.up.prevent="move(-1)"
            @keydown.enter.prevent="submit"
          >
        </div>
        <p
          v-if="q.trim() && !verified && access.state.value !== 'loading'"
          class="hint"
        >
          {{ t('search.needsVerification') }}
        </p>
        <p
          v-else-if="status === 'error'"
          class="hint"
          role="alert"
        >
          {{ errorText(failure) }}
        </p>
        <ul
          v-else-if="hits.length"
          id="palette-list"
          role="listbox"
          :aria-label="t('search.results')"
        >
          <li
            v-for="(hit, index) in hits"
            :id="`palette-${index}`"
            :key="hit.to"
            role="option"
            :aria-selected="index === active"
            :class="{ on: index === active }"
            @mousemove="active = index"
            @click="go(hit.to)"
          >
            <component
              :is="hit.icon"
              aria-hidden="true"
            />
            <span class="group-body"><span class="truncate">{{ hit.title }}</span></span>
            <span class="subtle">{{ hit.kind }}</span>
          </li>
        </ul>
        <p
          v-else
          class="hint"
        >
          {{ status === 'loading' ? t('search.searching') : q.trim() ? t('search.noMatch') : t('search.typeToSearch') }}
        </p>
        <button
          v-if="q.trim() && verified"
          class="all"
          type="button"
          @click="go(`/search?q=${encodeURIComponent(q.trim())}`)"
        >
          {{ t('search.allResults') }}
        </button>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.trigger { background: transparent; color: var(--label-2); }
.trigger:hover { background: var(--fill); }
.trigger-field { display: none; }
/* Wide screens show a field; it narrows, then becomes an icon. Phones use the tab bar. */
@media (min-width: 761px) {
  @container nav-tools (min-width: 23.5rem) {
    .btn.trigger { flex: 1 1 28rem; justify-content: flex-start; gap: .5rem; width: auto; min-width: 14rem; max-width: 28rem; min-height: 36px; margin-inline: auto; padding-inline: .75rem .5rem; border-radius: var(--pill); background: var(--fill); font-size: .875rem; font-weight: 400; }
    .trigger:hover { background: var(--fill-strong); }
    .trigger:active:not(:disabled) { transform: none; }
    .trigger-field { display: flex; flex: 1; align-items: center; justify-content: space-between; gap: .5rem; min-width: 0; color: var(--label-3); }
    .trigger-field kbd { flex: none; padding: .0625rem .375rem; border-radius: .375rem; background: var(--fill); color: var(--label-3); font: inherit; font-size: .6875rem; }
  }
}
</style>

<style>
.palette-overlay { position: fixed; inset: 0; z-index: 100; background: rgb(0 0 0 / .3); }
.palette { position: fixed; inset-block-start: 12vh; inset-inline: 0; z-index: 101; width: min(calc(100% - 1.5rem), 36rem); margin-inline: auto; overflow: hidden; border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-float); }
.palette .field-row { display: flex; align-items: center; gap: .625rem; padding-inline: 1rem; border-block-end: .5px solid var(--separator); }
.palette .field-row svg { flex: none; width: 1.125rem; height: 1.125rem; color: var(--label-3); }
.palette input { flex: 1; min-width: 0; height: 48px; border: 0; outline: 0; background: transparent; color: var(--label); font: inherit; }
.palette ul { max-height: 50vh; overflow-y: auto; padding: .375rem; }
.palette li { display: flex; align-items: center; gap: .75rem; padding: .5rem .625rem; border-radius: var(--radius-sm); cursor: pointer; }
.palette li.on { background: var(--accent-soft); }
.palette li > svg { flex: none; width: 1.125rem; height: 1.125rem; color: var(--label-3); }
.palette .hint { padding: 2rem 1rem; color: var(--label-2); text-align: center; }
.palette .all { display: block; width: 100%; padding: .75rem 1rem; border: 0; border-block-start: .5px solid var(--separator); background: transparent; color: var(--accent); font: inherit; text-align: start; cursor: pointer; }
.palette .all:hover { background: var(--fill); }
</style>
