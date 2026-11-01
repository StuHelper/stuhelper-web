<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BookOpen, FolderOpen, GraduationCap, Search } from 'lucide-vue-next'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAccess } from '../../features/account/access'
import { recentPages } from '../../shared/recent'
import { courseSeeds, resources, teachers } from '../data'
const { t: tr } = useI18n()
// 全站搜索：Ctrl+K 打开。未认证用户拿不到任何课程内容。
const router = useRouter(); const access = useAccess()
const open = ref(false); const q = ref(''); const active = ref(0)
const icons = { course: BookOpen, teacher: GraduationCap, resource: FolderOpen }
const kinds = computed(() => ({ course: tr('demo.courses'), teacher: tr('demo.teachers'), resource: tr('demo.resourcesShort') }))
const verified = computed(() => access.state.value === 'verified')
const hits = computed(() => {
  if (!verified.value) return []
  const s = q.value.trim().toLowerCase()
  if (!s) return recentPages().map((r) => ({ to: r.path, kind: r.kind, title: r.title, sub: tr('demo.recentlyViewed') }))
  return [
    ...courseSeeds.filter((c) => c[1].toLowerCase().includes(s) || c[2].toLowerCase().includes(s)).map((c) => ({ to: `/courses/${c[0]}`, kind: 'course' as const, title: c[1], sub: c[2] })),
    ...teachers.filter((t) => t.name.includes(s)).map((t) => ({ to: `/teachers/${t.id}`, kind: 'teacher' as const, title: t.name, sub: tr('demo.teachers') })),
    ...resources.filter((r) => r.current?.metadata.title.toLowerCase().includes(s)).map((r) => ({ to: `/resources/items/${r.id}`, kind: 'resource' as const, title: r.current!.metadata.title, sub: r.current!.category.names['zh-CN'] })),
  ].slice(0, 10)
})
watch(open, (value) => { if (value) { q.value = ''; active.value = 0 } })
watch(q, () => { active.value = 0 })
function go(to?: string) { if (!to) return; open.value = false; void router.push(to) }
function move(step: number) { const n = hits.value.length; if (n) active.value = (active.value + step + n) % n }
function hotkey(e: KeyboardEvent) { if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); open.value = true } }
onMounted(() => window.addEventListener('keydown', hotkey))
onBeforeUnmount(() => window.removeEventListener('keydown', hotkey))
</script>
<template>
  <button class="btn btn-icon trigger" type="button" :aria-label="tr('demo.searchHotkeyLabel')" :title="tr('demo.searchHotkeyTitle')" @click="open = true"><Search aria-hidden="true" /><span class="trigger-field"><span class="truncate">{{ tr('demo.searchAllShort') }}</span><kbd>Ctrl K</kbd></span></button>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="d-drawer-overlay" />
      <DialogContent class="palette" aria-describedby="">
        <DialogTitle class="visually-hidden">{{ tr('demo.search') }}</DialogTitle>
        <div class="field-row"><Search aria-hidden="true" /><input v-model="q" type="search" :placeholder="tr('demo.searchAllLong')" :aria-label="tr('demo.search')" role="combobox" aria-expanded="true" aria-controls="palette-list" :aria-activedescendant="hits.length ? `palette-${active}` : undefined" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="go(hits[active]?.to)"></div>
        <p v-if="!verified && access.state.value !== 'loading'" class="hint">{{ tr('demo.searchNeedsVerification') }}</p>
        <ul v-else-if="hits.length" id="palette-list" role="listbox" :aria-label="tr('demo.searchResults')">
          <li v-for="(h, i) in hits" :id="`palette-${i}`" :key="h.to" role="option" :aria-selected="i === active" :class="{ on: i === active }" @mousemove="active = i" @click="go(h.to)"><component :is="icons[h.kind]" aria-hidden="true" /><span class="group-body"><span class="truncate">{{ h.title }}</span><span class="subtle truncate">{{ h.sub }}</span></span><span class="subtle">{{ kinds[h.kind] }}</span></li>
        </ul>
        <p v-else class="hint">{{ q.trim() ? tr('demo.noMatchFor', { p0: q.trim() }) : tr('demo.typeToSearch') }}</p>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
<style scoped>
.trigger { background: transparent; color: var(--label-2); }
.trigger:hover { background: var(--fill); }
.trigger-field { display: none; }
/* 顺序：宽屏显示搜索框，空间减小时搜索框收窄，放不下时变成图标，手机宽度再由底部标签栏接管导航。
   按导航工具区的实际宽度判断，因为八种语言的导航文字长度不同。 */
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
.palette { position: fixed; inset-block-start: 12vh; inset-inline: 0; z-index: 101; width: min(calc(100% - 1.5rem), 36rem); margin-inline: auto; overflow: hidden; border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-float); animation: d-fade .15s; }
.palette .field-row { display: flex; align-items: center; gap: .625rem; padding-inline: 1rem; border-block-end: .5px solid var(--separator); }
.palette .field-row svg { flex: none; width: 1.125rem; height: 1.125rem; color: var(--label-3); }
.palette input { flex: 1; min-width: 0; height: 48px; border: 0; outline: 0; background: transparent; color: var(--label); font: inherit; }
.palette ul { max-height: 50vh; overflow-y: auto; padding: .375rem; }
.palette li { display: flex; align-items: center; gap: .75rem; padding: .5rem .625rem; border-radius: var(--radius-sm); cursor: pointer; }
.palette li.on { background: var(--accent-soft); }
.palette li > svg { flex: none; width: 1.125rem; height: 1.125rem; color: var(--label-3); }
.palette .hint { padding: 2rem 1rem; color: var(--label-2); text-align: center; }
</style>
