<script setup lang="ts">
import { teacherDirectoryEnabled } from '../../app/features'
import { Building2, BookOpen, FileText, FolderOpen, GraduationCap, Search } from 'lucide-vue-next'
import { computed, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { usePageFilters } from '../../shared/pageFilters'
import { usePaged } from '../../shared/composables/async'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { targetRoute, useSearchApi, type SearchItem, type SearchKind } from './api'

// Full search results with a type filter. The query and filter live in page
// state, so the address stays /search while reload and back keep the results.
const { t } = useI18n()
const page = usePageFilters(['q', 'kind'] as const)
const api = useSearchApi()
const kinds = (['school', 'course', 'teacher', 'review', 'resource'] as const).filter((kind) => teacherDirectoryEnabled || kind !== 'teacher')
const icons: Record<SearchKind, Component> = { school: Building2, course: BookOpen, teacher: GraduationCap, review: FileText, resource: FolderOpen }

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
}, { immediate: true })

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
      <p
        v-if="!q"
        class="muted"
      >
        {{ t('search.typeToSearch') }}
      </p>
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
              <span class="group-body">
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
</style>
