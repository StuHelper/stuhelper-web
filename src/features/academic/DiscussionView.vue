<script setup lang="ts">
import { nextTick, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAsync, usePaged } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { listSize, subjectPath, useAcademic, type CatalogObject, type Result, type Review } from './api'
import { useAuthorName } from './presentation'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'

// One discussion: the root review and its replies in posting order.
const props = defineProps<{ id: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const api = useAcademic()
const authorName = useAuthorName()
const replyTo = shallowRef<Review>()
const editorVersion = ref(0)
const editor = ref<HTMLElement>()
const notice = ref('')
const names = shallowRef(new Map<string, CatalogObject>())

const root = useAsync(async (signal) => {
  const entry = await api.review(props.id, signal)
  if (entry.root_id !== entry.id) {
    // A reply link opens its discussion at the reply.
    await router.replace({ path: `/reviews/${encodeURIComponent(entry.root_id)}`, query: route.query, hash: `#review-${entry.id}` })
  }
  return { entry, names: await api.lookup([entry.target_id, entry.term_id, entry.teacher_id], signal) }
})
const replies = usePaged(async (after, signal) => {
  const page = await api.reviews({ kind: 'reply', root_id: props.id, sort: 'oldest', after, limit: listSize }, signal)
  const found = await api.lookup(page.items.flatMap((row) => [row.target_id, row.term_id, row.teacher_id]), signal)
  names.value = new Map([...(after ? names.value : []), ...found])
  return page
})

watch(() => props.id, () => {
  replyTo.value = undefined
  notice.value = ''
  void root.reload()
  void replies.reload()
}, { immediate: true })

async function reply(review: Review) {
  replyTo.value = review.id === props.id ? undefined : review
  await nextTick()
  editor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  editor.value?.querySelector('textarea')?.focus({ preventScroll: true })
}

function submitted(result: Result) {
  notice.value = t(result.state === 'pending' ? 'academic.editor.pending' : 'academic.editor.published')
  replyTo.value = undefined
  editorVersion.value++
  void replies.reload()
}

function updateRoot(review: Review) {
  if (root.data.value) root.data.value = { ...root.data.value, entry: review }
}
function updateReply(review: Review) {
  replies.items.value = replies.items.value.map((row) => (row.id === review.id ? review : row))
}
function removeReply(id: string) {
  replies.items.value = replies.items.value.filter((row) => row.id !== id)
}
async function removeRoot() {
  const target = root.data.value ? root.data.value.names.get(root.data.value.entry.target_id) : undefined
  await router.replace(target ? subjectPath(target) : '/courses')
}
</script>

<template>
  <div class="stack-lg discussion">
    <h1>{{ t('academic.discussion') }}</h1>
    <AsyncState
      :status="root.status.value"
      :error="root.error.value"
      @retry="root.reload"
    >
      <div
        v-if="root.data.value"
        class="stack-lg"
      >
        <ReviewCard
          :review="root.data.value.entry"
          :names="root.data.value.names"
          reply-enabled
          @reply="reply"
          @updated="updateRoot"
          @removed="removeRoot"
        />

        <section class="section">
          <h2>{{ t('academic.replies.title') }}</h2>
          <PagedState
            :status="replies.status.value"
            :error="replies.error.value"
            :count="replies.items.value.length"
            :next="replies.next.value"
            :appending="replies.appending.value"
            :empty-text="t('academic.replies.empty')"
            @retry="replies.reload"
            @more="replies.loadMore"
          >
            <ul class="list">
              <li
                v-for="review in replies.items.value"
                :key="review.id"
              >
                <ReviewCard
                  :review="review"
                  :names="names"
                  standalone
                  reply-enabled
                  @reply="reply"
                  @updated="updateReply"
                  @removed="removeReply"
                />
              </li>
            </ul>
          </PagedState>
        </section>

        <section
          ref="editor"
          class="stack"
        >
          <p
            v-if="notice"
            class="notice notice-success"
            role="status"
          >
            {{ notice }}
          </p>
          <div
            v-if="replyTo"
            class="notice notice-info"
          >
            <span class="stack-sm">
              <span>{{ t('academic.replies.replyingTo', { name: authorName(replyTo) }) }}</span>
              <span class="small muted truncate quote">{{ replyTo.body }}</span>
            </span>
            <button
              class="btn btn-sm"
              type="button"
              @click="replyTo = undefined"
            >
              {{ t('academic.replies.cancelTarget') }}
            </button>
          </div>
          <ReviewEditor
            :key="`${id}-${editorVersion}`"
            kind="reply"
            :target-id="root.data.value.entry.target_id"
            :school-id="root.data.value.entry.school_id"
            :parent-id="replyTo?.id ?? id"
            @submitted="submitted"
            @cancel="replyTo = undefined"
          />
        </section>
      </div>
    </AsyncState>
  </div>
</template>

<style scoped>
.discussion { max-width: 52rem; }
.quote { max-width: 36rem; }
</style>
