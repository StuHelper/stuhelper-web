<script setup lang="ts" generic="T">
import { ChevronDown } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { ApiError, errorCode } from '../../shared/api/errors'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'

// One department in the grouped course directory. The section reads its own first rows when
// it comes near the screen, and "show all" reads every page of that department. Each section
// loads on its own, so no shared "load more" mixes departments.
const props = defineProps<{
  name: string
  count: number
  summary: string
  preview: number
  /** Page-wide expand or collapse; a new turn overrides this card's own choice. */
  bulk?: { expanded: boolean; turn: number }
  load: (after: string, limit: number, signal: AbortSignal) => Promise<{ items: T[]; next: string }>
}>()
defineSlots<{ default(props: { rows: T[] }): unknown }>()
const { t } = useI18n()
const format = useFormat()

// The API serves at most this many rows per page.
const pageLimit = 100
const rows = shallowRef<T[]>([])
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const error = ref('')
const expanded = ref(false)
const complete = ref(false)
let controller: AbortController | undefined

async function read(all: boolean, retryConflict = true) {
  controller?.abort()
  const current = new AbortController()
  controller = current
  status.value = 'loading'
  error.value = ''
  try {
    if (!all) {
      const page = await props.load('', props.preview, current.signal)
      if (controller !== current) return
      rows.value = page.items
      complete.value = !page.next
    } else {
      // Rows appear page by page so a large department does not wait for its last page.
      let after = ''
      const loaded: T[] = []
      const cursors = new Set<string>()
      do {
        const page = await props.load(after, pageLimit, current.signal)
        if (controller !== current) return
        loaded.push(...page.items)
        rows.value = [...loaded]
        after = page.next
        if (after && (cursors.has(after) || !page.items.length || loaded.length >= props.count)) throw new ApiError('conflict', false, 409)
        cursors.add(after)
      } while (after)
      complete.value = true
    }
    status.value = 'ready'
  } catch (failure) {
    if (controller !== current) return
    if (retryConflict && all && failure instanceof ApiError && failure.status === 409) return read(all, false)
    error.value = errorCode(failure)
    status.value = 'error'
  }
}

const section = ref<HTMLElement>()
let observer: IntersectionObserver | undefined
watch(section, (element) => {
  observer?.disconnect()
  if (!element) return
  if (typeof IntersectionObserver === 'undefined') { void read(false); return }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    void read(expanded.value)
  }, { rootMargin: '800px 0px' })
  observer.observe(element)
})
onBeforeUnmount(() => { observer?.disconnect(); controller?.abort() })

watch(() => props.bulk?.turn, () => {
  if (!props.bulk) return
  expanded.value = props.bulk.expanded
  // Cards not reached yet read everything when they first come near the screen.
  if (expanded.value && status.value !== 'idle' && !complete.value) void read(true)
})
const shown = computed(() => (expanded.value ? rows.value : rows.value.slice(0, props.preview)))
function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && !complete.value) void read(true)
}
const retry = () => void read(expanded.value)
</script>

<template>
  <section
    ref="section"
    class="card flush"
    :aria-label="name"
    :aria-busy="status === 'loading' || undefined"
  >
    <header class="group-head">
      <h2 class="card-title">
        {{ name }}
      </h2>
      <span class="subtle">{{ summary }}</span>
    </header>
    <ul
      v-if="status === 'idle' || (status === 'loading' && rows.length === 0)"
      class="placeholder"
      aria-hidden="true"
    >
      <li
        v-for="i in Math.min(preview, count)"
        :key="i"
        class="skeleton-line"
      />
    </ul>
    <slot
      v-else
      :rows="shown"
    />
    <ErrorNotice
      v-if="status === 'error'"
      class="group-error"
      :code="error"
      @retry="retry"
    />
    <button
      v-else-if="count > preview"
      class="more"
      type="button"
      :aria-expanded="expanded"
      :aria-busy="(expanded && status === 'loading') || undefined"
      @click="toggle"
    >
      <ChevronDown
        :class="{ flip: expanded }"
        aria-hidden="true"
      />{{ expanded ? (status === 'loading' ? t('common.loading') : t('browse.collapse')) : t('browse.expandAll', { p0: format.number(count) }) }}
    </button>
  </section>
</template>

<style scoped>
.flush { min-width: 0; padding: 0; overflow: hidden; container-type: inline-size; }
.group-head { display: grid; gap: .0625rem; padding: .75rem 1rem; border-block-end: .5px solid var(--separator); background: var(--fill); }
.placeholder { display: grid; gap: .5rem; padding: .75rem 1rem; }
.skeleton-line { height: 1.5rem; border-radius: .375rem; background: var(--fill); }
.group-error { margin: .75rem 1rem; }
.more { display: flex; align-items: center; justify-content: center; gap: .25rem; width: 100%; min-height: 40px; border: 0; border-block-start: .5px solid var(--separator); background: transparent; color: var(--accent); font: inherit; font-size: .875rem; cursor: pointer; }
.more:hover { background: var(--fill); }
.more svg { width: 1rem; height: 1rem; transition: transform .2s; }
.more svg.flip { transform: rotate(180deg); }
@media (prefers-reduced-motion: no-preference) { .skeleton-line { animation: pulse 1.2s ease-in-out infinite; } }
@keyframes pulse { 50% { opacity: .5; } }
</style>
