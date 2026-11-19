<script setup lang="ts">
import { ThumbsDown, ThumbsUp } from 'lucide-vue-next'
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import { useMutation, usePaged } from '../../shared/composables/async'
import PagedState from '../../shared/ui/PagedState.vue'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic, type Reference } from '../academic/api'
import { targetRoute, useSearchApi, type Vote } from './api'

// Withdrawal uses the review service's own-vote action even after campus eligibility expires.
const { t } = useI18n()
const api = useSearchApi()
const academic = useAcademic()
const names = shallowRef(new Map<string, Reference>())
const list = usePaged<Vote>((cursor, signal) => api.myVotes(cursor, signal))
void list.reload()
const write = useMutation()
async function withdraw(id: string) {
  const action = { action: 'vote' as const, vote: 0 }
  if (await write.run(`withdraw:${id}`, action, (body, key) => academic.act(id, body, key))) await list.reload()
}
async function retry() {
  if (await write.retry()) await list.reload()
}
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
    <MutationNotice
      :busy="write.busy.value"
      :error="write.error.value"
      :uncertain="write.uncertain.value"
      @retry="retry"
    />
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
          <button
            v-if="vote.target.source === 'reviews' && vote.target.kind === 'review'"
            class="btn btn-sm btn-ghost"
            type="button"
            :disabled="write.busy.value || write.uncertain.value"
            @click="withdraw(vote.target.id)"
          >
            {{ t('search.votes.cancel') }}
          </button>
        </li>
      </ul>
    </PagedState>
  </MeLayout>
</template>
