<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useAcademic, type Review } from './api'
import { useAuthorName } from './presentation'

// The first replies of a discussion, shown under its review in a list. They are
// read when the review scrolls into view, so a long list asks only for what is
// seen. The whole discussion stays one click away.
const props = defineProps<{ rootId: string; to: string }>()
const shownCount = 2
const { t } = useI18n()
const api = useAcademic()
const authorName = useAuthorName()
const root = ref<HTMLElement>()
const replies = shallowRef<Review[]>([])
const more = ref(false)
const controller = new AbortController()
let observer: IntersectionObserver | undefined

async function load() {
  try {
    // One more than shown tells whether the discussion continues.
    const page = await api.reviews({ kind: 'reply', root_id: props.rootId, sort: 'oldest', limit: shownCount + 1 }, controller.signal)
    replies.value = page.items.slice(0, shownCount)
    more.value = page.items.length > shownCount
  } catch {
    // The preview is an addition to the review. Without it the card still links to the discussion, which reports its own errors.
  }
}
onMounted(() => {
  if (typeof IntersectionObserver === 'undefined' || !root.value) {
    void load()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    observer?.disconnect()
    void load()
  }, { rootMargin: '200px 0px' })
  observer.observe(root.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  controller.abort()
})
</script>

<template>
  <div
    ref="root"
    class="replies"
    :class="{ filled: replies.length }"
  >
    <ul
      v-if="replies.length"
      class="reply-list"
      :aria-label="t('academic.replies.title')"
    >
      <li
        v-for="reply in replies"
        :key="reply.id"
        class="reply"
      >
        <span
          class="reply-avatar"
          aria-hidden="true"
        >{{ [...authorName(reply)][0] }}</span>
        <p class="reply-text">
          <b>{{ authorName(reply) }}</b>
          <span class="reply-body">{{ reply.body }}</span>
        </p>
      </li>
    </ul>
    <RouterLink
      v-if="more"
      class="reply-more"
      :to="to"
    >
      {{ t('academic.review.openDiscussion') }}
    </RouterLink>
  </div>
</template>

<style scoped>
.replies.filled { display: grid; gap: .5rem; padding: .75rem .875rem; border-radius: var(--radius); background: var(--fill); animation: replies-in .35s var(--ease-out); }
@keyframes replies-in { from { opacity: 0; transform: translateY(-4px); } }
.reply-list { display: grid; gap: .5rem; }
.reply { display: flex; align-items: flex-start; gap: .5rem; min-width: 0; }
.reply-avatar { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--fill-strong); color: var(--label-2); font-size: .6875rem; font-weight: 650; }
.reply-text { display: -webkit-box; overflow: hidden; min-width: 0; font-size: .875rem; line-height: 1.5; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.reply-text b { margin-inline-end: .375rem; font-weight: 600; }
.reply-body { color: var(--label-2); }
.reply-more { justify-self: start; font-size: .8125rem; font-weight: 550; }
</style>
