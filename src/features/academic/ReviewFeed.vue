<script setup lang="ts">
import ChoiceGroup from './ChoiceGroup.vue'
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
const sort = ref<'newest' | 'oldest'>('newest')
const names = shallowRef(new Map<string, CatalogObject>())

const feed = usePaged(async (after, signal) => {
  const page = await api.reviews({ kind: props.kind, target_id: props.targetId, teacher_id: props.teacherId || teacher.value, term_id: term.value, sort: sort.value, after, limit: listSize }, signal)
  const found = await api.lookup(page.items.flatMap((row) => [row.target_id, row.term_id, row.teacher_id]), signal)
  names.value = new Map([...(after ? names.value : []), ...found])
  return page
})

const filters = useAsync(async (signal) => {
  if (!props.filterable || props.kind !== 'course' || !props.schoolId) return { terms: [], teachers: [] }
  const [terms, teachers] = await Promise.all([
    api.options({ kind: 'term', school_id: props.schoolId }, signal),
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
  <div class="stack">
    <div
      v-if="filterable && kind === 'course'"
      class="row feed-filters"
    >
      <ChoiceGroup
        v-if="termChoices.length > 1"
        v-model="term"
        compact
        :label="t('academic.feed.term')"
        :options="termChoices"
      />
      <ChoiceGroup
        v-if="teacherChoices.length > 1"
        v-model="teacher"
        compact
        :label="t('academic.feed.teacher')"
        :options="teacherChoices"
      />
      <label class="feed-sort">
        <span class="field-label">{{ t('academic.feed.sort') }}</span>
        <AppSelect
          v-model="sort"
          class="select"
        >
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
.feed-filters .field { min-width: 10rem; }
.feed-sort { display: inline-flex; align-items: center; gap: .5rem; white-space: nowrap; }
.feed-sort .select { min-height: 32px; font-size: .8125rem; }
.feed-filters { align-items: center; gap: .5rem 1rem; }
</style>
