<script setup lang="ts">
import { teacherDirectoryEnabled } from '../../app/features'
import { Building2, BookOpen, FileText, FolderOpen, GraduationCap, Search, ThumbsDown, ThumbsUp } from 'lucide-vue-next'
import { computed, ref, shallowRef, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { usePageFilters } from '../../shared/pageFilters'
import { usePaged } from '../../shared/composables/async'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { targetRoute, useSearchApi, type SearchItem, type SearchKind } from './api'
import { useAcademic } from '../academic/api'
import { cardsByIds, type CourseCard } from '../academic/courseCard'
import CourseCardLine from '../academic/CourseCardLine.vue'

// Full search results with a type filter. The query and filter live in page
// state, so the address stays /search while reload and back keep the results.
const { t } = useI18n()
const page = usePageFilters(['q', 'kind'] as const)
const api = useSearchApi()
const kinds = (['school', 'course', 'teacher', 'review', 'resource'] as const).filter((kind) => teacherDirectoryEnabled || kind !== 'teacher')
const icons: Record<SearchKind, Component> = { school: Building2, course: BookOpen, teacher: GraduationCap, review: FileText, resource: FolderOpen }

// Before a query is entered the page lists the reviews the caller voted on that
// are still readable to them; the server applies current permissions per page.
const readableVotes = usePaged((cursor, signal) => api.myVotes(cursor, signal))

const q = computed(() => page.values.value.q.trim().slice(0, 200))
const kind = computed<SearchKind | ''>(() => (kinds as readonly string[]).includes(page.values.value.kind) ? page.values.value.kind as SearchKind : '')
const draft = ref(q.value)
const filter = computed({
  get: () => kind.value || 'all',
  set: (value: string) => page.replace({ kind: value === 'all' ? undefined : value }),
})
const tabs = computed(() => [{ value: 'all', label: t('search.all') }, ...kinds.map((value) => ({ value, label: t(`search.kinds.${value}`) }))])

const list = usePaged<SearchItem>((cursor, signal) => api.search(q.value, kind.value, cursor, signal))
watch([q, kind], () => {
  draft.value = q.value
  if (q.value) void list.reload()
  else if (readableVotes.status.value === 'idle') void readableVotes.reload()
}, { immediate: true })

// Course results gain the facts of a course list row; each loaded page is looked up once.
const academic = useAcademic()
const cards = shallowRef(new Map<string, CourseCard>())
watch(() => list.items.value, async (items, _, onCleanup) => {
  const missing = items.filter((item) => item.target.kind === 'course' && !cards.value.has(item.target.id)).map((item) => item.target.id)
  if (!missing.length) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const found = await cardsByIds(academic, missing, controller.signal)
    if (!controller.signal.aborted) cards.value = new Map([...cards.value, ...found])
  } catch {
    // Titles stay as they are when the lookup fails.
  }
})

function submit() {
  const text = draft.value.trim()
  if (text) page.replace({ q: text })
}
</script>

<template>
  <div class="stack-lg">
    <PageHeader :title="t('search.title')" />
    <form
      class="search-row"
      role="search"
      @submit.prevent="submit"
    >
      <label class="field">
        <Search aria-hidden="true" />
        <input
          v-model="draft"
          type="search"
          maxlength="200"
          :placeholder="t('search.placeholder')"
          :aria-label="t('search.title')"
        >
      </label>
      <button
        class="btn btn-primary"
        type="submit"
        :disabled="!draft.trim()"
      >
        {{ t('search.submit') }}
      </button>
    </form>
    <TabBar
      v-model="filter"
      :tabs="tabs"
      :label="t('search.filter')"
      id-prefix="search-kind"
    />
    <div
      id="search-kind-panel"
      role="tabpanel"
      :aria-labelledby="`search-kind-tab-${filter}`"
    >
      <div
        v-if="!q"
        class="stack-lg"
      >
        <p class="muted">
          {{ t('search.typeToSearch') }}
        </p>
        <section
          class="stack-sm"
          aria-labelledby="search-votes-title"
        >
          <h2
            id="search-votes-title"
            class="d-title"
          >
            {{ t('search.votes.readable') }}
          </h2>
          <PagedState
            :status="readableVotes.status.value"
            :error="readableVotes.error.value"
            :count="readableVotes.items.value.length"
            :next="readableVotes.next.value"
            :appending="readableVotes.appending.value"
            :empty-text="t('search.votes.empty')"
            @retry="readableVotes.reload"
            @more="readableVotes.loadMore"
          >
            <ul class="group">
              <li
                v-for="vote in readableVotes.items.value"
                :key="vote.target.id"
              >
                <RouterLink
                  class="group-row has-icon"
                  :to="targetRoute(vote.target)"
                >
                  <span
                    class="icon-tile vote-tile"
                    :class="vote.choice"
                  ><component
                    :is="vote.choice === 'up' ? ThumbsUp : ThumbsDown"
                    aria-hidden="true"
                  /></span>
                  <span class="group-body">
                    <span class="group-title">{{ vote.title || t('search.votes.review') }}</span>
                    <span class="subtle">{{ t(vote.choice === 'up' ? 'search.votes.up' : 'search.votes.down') }}</span>
                  </span>
                </RouterLink>
              </li>
            </ul>
          </PagedState>
        </section>
      </div>
      <PagedState
        v-else
        :status="list.status.value"
        :error="list.error.value"
        :count="list.items.value.length"
        :next="list.next.value"
        :appending="list.appending.value"
        :empty-text="t('search.noMatch')"
        @retry="list.reload"
        @more="list.loadMore"
      >
        <ul
          class="group"
          :aria-label="t('search.results')"
        >
          <li
            v-for="item in list.items.value"
            :key="`${item.target.kind}:${item.target.id}`"
          >
            <RouterLink
              class="group-row has-icon"
              :to="targetRoute(item.target)"
            >
              <span class="icon-tile"><component
                :is="icons[item.target.kind]"
                aria-hidden="true"
              /></span>
              <CourseCardLine
                v-if="cards.get(item.target.id) && item.target.kind === 'course'"
                :card="cards.get(item.target.id)!"
              />
              <span
                v-else
                class="group-body"
              >
                <span class="group-title">{{ item.title }}</span>
                <span class="subtle">{{ t(`search.kinds.${item.target.kind}`) }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </PagedState>
    </div>
  </div>
</template>

<style scoped>
.search-row { display: flex; gap: .5rem; }
.field { display: flex; flex: 1; align-items: center; gap: .5rem; min-width: 0; padding-inline: .75rem; border-radius: var(--radius-sm); background: var(--fill); }
.field svg { flex: none; width: 1.125rem; height: 1.125rem; color: var(--label-3); }
.field input { flex: 1; min-width: 0; height: 40px; border: 0; outline: 0; background: transparent; color: var(--label); font: inherit; }
.field:focus-within { outline: 2px solid var(--accent-fill); outline-offset: 1px; }
.vote-tile.up { background: var(--c-green); }
.vote-tile.down { background: var(--c-orange); }
</style>
