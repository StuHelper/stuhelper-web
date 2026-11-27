<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAsync, usePaged } from '../../shared/composables/async'
import PagedState from '../../shared/ui/PagedState.vue'
import { listSize, useAcademic, type CatalogObject, type Review } from './api'
import ReviewCard from './ReviewCard.vue'

// Course reviews of one course or one teacher, or mentor reviews of a teacher.
const props = withDefaults(defineProps<{ kind: 'course' | 'mentor'; targetId?: string; teacherId?: string; schoolId?: string; filterable?: boolean }>(), { targetId: undefined, teacherId: undefined, schoolId: undefined, filterable: false })
const { t } = useI18n()
const api = useAcademic()
const term = ref('')
const teacher = ref('')
const sort = ref<'upvotes' | 'newest' | 'oldest'>('upvotes')
const names = shallowRef(new Map<string, CatalogObject>())

const feed = usePaged(async (after, signal) => {
  // The list carries each review's reply count and first replies, so cards need no request of their own.
  const page = await api.reviews({ kind: props.kind, target_id: props.targetId, teacher_id: props.teacherId || teacher.value, term_id: term.value, sort: sort.value, after, limit: listSize, include_reply_preview: 'true' }, signal)
  const found = await api.lookup(page.items.flatMap((row) => [row.target_id, row.term_id, ...(row.teacher_ids ?? [])]), signal)
  names.value = new Map([...(after ? names.value : []), ...found])
  return page
})

const filters = useAsync(async (signal) => {
  if (!props.filterable || props.kind !== 'course' || !props.schoolId) return { terms: [], teachers: [] }
  const [terms, teachers] = await Promise.all([
    // Only the terms this course was offered in, the same range the review editor offers.
    api.options({ kind: 'term', course_id: props.targetId, school_id: props.schoolId }, signal),
    props.teacherId || !props.targetId ? Promise.resolve([]) : api.options({ kind: 'teacher', course_id: props.targetId, school_id: props.schoolId }, signal),
  ])
  return { terms, teachers }
})

function update(review: Review) {
  feed.items.value = feed.items.value.map((row) => (row.id === review.id ? review : row))
}
function remove(id: string) {
  feed.items.value = feed.items.value.filter((row) => row.id !== id)
}

watch(() => [props.kind, props.targetId, props.teacherId, props.schoolId], () => {
  term.value = ''
  teacher.value = ''
  void feed.reload()
  void filters.reload()
})
watch([term, teacher, sort], () => void feed.reload())
onMounted(() => {
  void feed.reload()
  void filters.reload()
})
defineExpose({ refresh: feed.reload })
const termChoices = computed(() => [{ value: '', label: t('common.all') }, ...(filters.data.value?.terms ?? []).map((item) => ({ value: item.id, label: item.name }))])
const teacherChoices = computed(() => [{ value: '', label: t('common.all') }, ...(filters.data.value?.teachers ?? []).map((item) => ({ value: item.id, label: item.name }))])
</script>

<template>
  <div class="stack feed">
    <div
      v-if="(filterable && kind === 'course') || feed.items.value.length > 1"
      class="row feed-filters"
    >
      <!-- Dropdowns keep the row short however many terms or teachers there are; a long list opens with a search field. -->
      <label
        v-if="filterable && kind === 'course' && termChoices.length > 1"
        class="feed-sort"
      >
        <span class="field-label">{{ t('academic.feed.term') }}</span>
        <AppSelect
          v-model="term"
          class="select"
        >
          <option
            v-for="item in termChoices"
            :key="item.value"
            :value="item.value"
          >{{ item.label }}</option>
        </AppSelect>
      </label>
      <label
        v-if="filterable && kind === 'course' && teacherChoices.length > 1"
        class="feed-sort"
      >
        <span class="field-label">{{ t('academic.feed.teacher') }}</span>
        <AppSelect
          v-model="teacher"
          class="select"
        >
          <option
            v-for="item in teacherChoices"
            :key="item.value"
            :value="item.value"
          >{{ item.label }}</option>
        </AppSelect>
      </label>
      <label class="feed-sort">
        <span class="field-label">{{ t('academic.feed.sort') }}</span>
        <AppSelect
          v-model="sort"
          class="select"
        >
          <option value="upvotes">{{ t('academic.feed.upvotes') }}</option>
          <option value="newest">{{ t('academic.feed.newest') }}</option>
          <option value="oldest">{{ t('academic.feed.oldest') }}</option>
        </AppSelect>
      </label>
    </div>
    <PagedState
      :status="feed.status.value"
      :error="feed.error.value"
      :count="feed.items.value.length"
      :next="feed.next.value"
      :appending="feed.appending.value"
      :empty-text="t(kind === 'mentor' ? 'academic.feed.emptyMentor' : 'academic.feed.empty')"
      @retry="feed.reload"
      @more="feed.loadMore"
    >
      <ul class="list">
        <li
          v-for="review in feed.items.value"
          :key="review.id"
        >
          <ReviewCard
            compact
            :hide-target="!!targetId"
            :review="review"
            :names="names"
            @updated="update"
            @removed="remove"
          />
        </li>
      </ul>
    </PagedState>
  </div>
</template>

<style scoped>
/* Reviews sit in two columns once the feed itself is wide enough; order still reads left to right, top to bottom. */
.feed { container: feed / inline-size; }
@container feed (min-width: 56rem) {
  .list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}
.feed-sort { display: inline-flex; align-items: center; gap: .5rem; white-space: nowrap; }
.feed-sort .select { min-height: 32px; max-width: 14rem; font-size: .8125rem; }
.feed-filters { align-items: center; gap: .5rem 1rem; }
</style>
