<script setup lang="ts">
import { ThumbsDown, ThumbsUp } from 'lucide-vue-next'
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { usePaged } from '../../shared/composables/async'
import PagedState from '../../shared/ui/PagedState.vue'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic, type Reference } from '../academic/api'
import { targetRoute, useSearchApi, type Vote } from './api'

// The caller's current up and down votes on reviews. Changing or withdrawing a
// vote happens on the review itself, under the review's own rules.
const { t } = useI18n()
const api = useSearchApi()
const academic = useAcademic()
const names = shallowRef(new Map<string, Reference>())
const list = usePaged<Vote>((cursor, signal) => api.myVotes(cursor, signal))
void list.reload()
// Titles come from the caller's own references, which stay readable after content admission lapses.
watch(list.items, async (items) => {
  const missing = items.map((vote) => vote.target.id).filter((id) => !names.value.has(id))
  if (!missing.length) return
  try {
    names.value = new Map([...names.value, ...await academic.references(missing)])
  } catch {
    // Titles are optional; each row still links to its review.
  }
})
</script>

<template>
  <MeLayout
    :title="t('search.votes.title')"
    :description="t('search.votes.description')"
  >
    <PagedState
      :status="list.status.value"
      :error="list.error.value"
      :count="list.items.value.length"
      :next="list.next.value"
      :appending="list.appending.value"
      :empty-text="t('search.votes.empty')"
      @retry="list.reload"
      @more="list.loadMore"
    >
      <ul class="group">
        <li
          v-for="vote in list.items.value"
          :key="vote.target.id"
        >
          <RouterLink
            class="group-row has-icon"
            :to="targetRoute(vote.target)"
          >
            <span class="icon-tile"><component
              :is="vote.choice === 'up' ? ThumbsUp : ThumbsDown"
              aria-hidden="true"
            /></span>
            <span class="group-body">
              <span class="group-title">{{ names.get(vote.target.id)?.name ?? t('search.votes.review') }}</span>
              <span class="subtle">{{ t(vote.choice === 'up' ? 'search.votes.up' : 'search.votes.down') }}</span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </PagedState>
  </MeLayout>
</template>
