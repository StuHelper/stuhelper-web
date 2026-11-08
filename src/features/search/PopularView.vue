<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { usePaged } from '../../shared/composables/async'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import { targetRoute, useSearchApi, type SearchItem } from './api'

// Popular courses and teachers ranked by recent views, reviews, favorites and
// interactions. Popularity is shown separately from ratings and never implies one.
const { t } = useI18n()
const format = useFormat()
const api = useSearchApi()
const kind = ref<'course' | 'teacher'>('course')
const tabs = computed(() => [{ value: 'course' as const, label: t('search.popular.courses') }, { value: 'teacher' as const, label: t('search.popular.teachers') }])
const list = usePaged<SearchItem>((cursor, signal) => api.popular(kind.value, cursor, signal))
watch(kind, () => void list.reload(), { immediate: true })
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :title="t('search.popular.title')"
      :description="t('search.popular.description')"
    />
    <TabBar
      v-model="kind"
      :tabs="tabs"
      :label="t('search.popular.kind')"
      id-prefix="popular"
    />
    <div
      id="popular-panel"
      role="tabpanel"
      :aria-labelledby="`popular-tab-${kind}`"
    >
      <PagedState
        :status="list.status.value"
        :error="list.error.value"
        :count="list.items.value.length"
        :next="list.next.value"
        :appending="list.appending.value"
        :empty-text="t('search.popular.empty')"
        @retry="list.reload"
        @more="list.loadMore"
      >
        <ol class="group">
          <li
            v-for="(item, index) in list.items.value"
            :key="item.target.id"
          >
            <RouterLink
              class="group-row has-icon"
              :to="targetRoute(item.target)"
            >
              <span
                class="rank"
                aria-hidden="true"
              >{{ format.number(index + 1) }}</span>
              <span class="group-body">
                <span class="group-title">{{ item.title }}</span>
              </span>
            </RouterLink>
          </li>
        </ol>
      </PagedState>
    </div>
  </div>
</template>

<style scoped>
.rank { flex: none; inline-size: 2rem; color: var(--label-3); font-variant-numeric: tabular-nums; text-align: center; }
</style>
