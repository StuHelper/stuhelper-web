<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { usePaged } from '../../shared/composables/async'
import PagedState from '../../shared/ui/PagedState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import MeLayout from '../account/MeLayout.vue'
import { localName, useResourcesApi, type Version } from './api'

// The uploader's resources. Resources are corrected or withdrawn by request;
// there is no plain delete.
const { t, locale } = useI18n()
const format = useFormat()
const api = useResourcesApi()
const mine = usePaged(async (after, signal) => {
  const page = await api.mine({ after }, signal)
  return { items: page.items, next: page.next_cursor }
})
onMounted(mine.reload)

function tone(state: Version['state']) {
  if (state === 'published' || state === 'approved') return 'success'
  if (state === 'rejected' || state === 'blocked') return 'danger'
  if (state === 'draft' || state === 'superseded') return 'neutral'
  return 'warning'
}
</script>

<template>
  <MeLayout
    :title="t('me.resources')"
    :description="t('me.resourcesIntro')"
  >
    <template #actions>
      <RouterLink
        class="btn btn-primary"
        to="/resources/new"
      >
        {{ t('resources.upload') }}
      </RouterLink>
    </template>
    <PagedState
      :status="mine.status.value"
      :error="mine.error.value"
      :count="mine.items.value.length"
      :next="mine.next.value"
      :appending="mine.appending.value"
      :empty-text="t('me.resourcesEmpty')"
      @retry="mine.reload"
      @more="mine.loadMore"
    >
      <ul class="list">
        <li
          v-for="item in mine.items.value"
          :key="item.id"
          class="card stack-sm"
        >
          <div class="row-between">
            <RouterLink
              class="card-title"
              :to="`/resources/items/${encodeURIComponent(item.id)}`"
            >
              {{ (item.proposal ?? item.current)?.metadata.title }}
            </RouterLink>
            <StatusTag :tone="item.state === 'published' ? 'success' : item.state === 'blocked' ? 'danger' : 'neutral'">
              {{ t(`resources.state.${item.state}`) }}
            </StatusTag>
          </div>
          <p class="row subtle">
            <span>{{ localName((item.proposal ?? item.current)?.category.names ?? {}, locale) }}</span>
            <span v-if="(item.proposal ?? item.current)?.created_at">{{ format.date((item.proposal ?? item.current)?.created_at ?? '') }}</span>
          </p>
          <p
            v-if="item.proposal"
            class="row small"
          >
            <span>{{ t('me.proposal') }}</span>
            <StatusTag :tone="tone(item.proposal.state)">
              {{ t(`resources.versionState.${item.proposal.state}`) }}
            </StatusTag>
            <span
              v-if="item.current && item.proposal.state === 'pending'"
              class="subtle"
            >{{ t('resources.detail.pendingVersion') }}</span>
          </p>
          <div class="row">
            <RouterLink
              class="btn btn-sm"
              :to="`/resources/items/${encodeURIComponent(item.id)}/edit`"
            >
              {{ t('me.correct') }}
            </RouterLink>
            <RouterLink
              class="btn btn-sm btn-ghost"
              :to="`/resources/items/${encodeURIComponent(item.id)}`"
            >
              {{ t('me.requestWithdrawal') }}
            </RouterLink>
          </div>
        </li>
      </ul>
    </PagedState>
  </MeLayout>
</template>

<style scoped>
.card-title { color: var(--text); text-decoration: none; }
.card-title:hover { color: var(--accent); }
</style>
