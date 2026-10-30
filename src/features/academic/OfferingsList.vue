<script setup lang="ts">
import { onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useAsync, usePaged } from '../../shared/composables/async'
import PagedState from '../../shared/ui/PagedState.vue'
import { listSize, useAcademic, type CatalogObject } from './api'

// Term offerings of a course or of a teacher, newest catalog order, filterable by term.
const props = withDefaults(defineProps<{ courseId?: string; teacherId?: string; schoolId: string }>(), { courseId: undefined, teacherId: undefined })
const { t } = useI18n()
const api = useAcademic()
const term = ref('')
const names = shallowRef(new Map<string, CatalogObject>())
const terms = useAsync((signal) => api.options({ kind: 'term', school_id: props.schoolId }, signal))
const offerings = usePaged(async (after, signal) => {
  const page = await api.objects({ kind: 'term_course', course_id: props.courseId, teacher_id: props.teacherId, term_id: term.value, after, limit: listSize }, signal)
  const found = await api.lookup(page.items.flatMap((item) => [item.course_id, item.term_id]), signal)
  names.value = new Map([...(after ? names.value : []), ...found])
  return { items: page.items, next: page.next }
})
watch(term, () => void offerings.reload())
watch(() => [props.courseId, props.teacherId, props.schoolId], () => {
  term.value = ''
  void terms.reload()
  void offerings.reload()
})
onMounted(() => {
  void terms.reload()
  void offerings.reload()
})
</script>

<template>
  <section class="section">
    <div class="section-head">
      <h2>{{ t('academic.offerings.title') }}</h2>
      <label class="row small">
        <span>{{ t('academic.feed.term') }}</span>
        <select
          v-model="term"
          class="select term"
        >
          <option value="">{{ t('common.all') }}</option>
          <option
            v-for="item in terms.data.value"
            :key="item.id"
            :value="item.id"
          >{{ item.name }}</option>
        </select>
      </label>
    </div>
    <PagedState
      :status="offerings.status.value"
      :error="offerings.error.value"
      :count="offerings.items.value.length"
      :next="offerings.next.value"
      :appending="offerings.appending.value"
      :empty-text="t('academic.offerings.empty')"
      @retry="offerings.reload"
      @more="offerings.loadMore"
    >
      <ul class="grid offerings">
        <li
          v-for="item in offerings.items.value"
          :key="item.id"
        >
          <RouterLink
            class="card card-link stack-sm"
            :to="`/offerings/${encodeURIComponent(item.id)}`"
          >
            <span class="card-title">{{ names.get(item.term_id ?? '')?.name ?? t('academic.offerings.unknownTerm') }}</span>
            <span class="small muted">{{ names.get(item.course_id ?? '')?.name ?? item.name }}</span>
          </RouterLink>
        </li>
      </ul>
    </PagedState>
  </section>
</template>

<style scoped>
.offerings { list-style: none; }
.term { width: auto; }
</style>
