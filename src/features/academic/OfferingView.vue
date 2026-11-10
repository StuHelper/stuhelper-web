<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { ApiError } from '../../shared/api/errors'
import { useAsync, usePaged } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { listSize, useAcademic } from './api'

// A term offering lists its teaching classes; a teaching class keeps its own
// co-teaching relations and timetable context.
const props = defineProps<{ kind: 'term_course' | 'class'; id: string }>()
const { t } = useI18n()
const api = useAcademic()
const isClass = computed(() => props.kind === 'class')

const context = useAsync(async (signal) => {
  const entry = await api.object(props.id, signal)
  if (entry.kind !== props.kind) throw new ApiError('not_found')
  const offering = isClass.value ? await api.object(entry.term_course_id ?? '', signal) : entry
  if (offering.kind !== 'term_course' || offering.school_id !== entry.school_id) throw new ApiError('incompatible')
  const names = await api.lookup([offering.course_id, offering.term_id, entry.school_id], signal)
  return { entry, offering, names }
})
const scope = () => (isClass.value ? { class_id: props.id } : { term_course_id: props.id })
const teachers = usePaged(async (after, signal) => {
  const page = await api.objects({ kind: 'teacher', ...scope(), after, limit: listSize }, signal)
  return { items: page.items, next: page.next }
})
const rows = usePaged(async (after, signal) => {
  const page = await api.objects({ kind: isClass.value ? 'schedule' : 'class', ...scope(), after, limit: listSize }, signal)
  return { items: page.items, next: page.next }
})
watch(() => [props.kind, props.id], () => {
  void context.reload()
  void teachers.reload()
  void rows.reload()
}, { immediate: true })
const course = computed(() => context.data.value?.names.get(context.data.value.offering.course_id ?? ''))
const term = computed(() => context.data.value?.names.get(context.data.value.offering.term_id ?? ''))
</script>

<template>
  <AsyncState
    :status="context.status.value"
    :error="context.error.value"
    @retry="context.reload"
  >
    <div
      v-if="context.data.value"
      class="stack-lg"
    >
      <PageHeader
        :eyebrow="t(isClass ? 'academic.teachingClass' : 'academic.offering')"
        :title="isClass ? context.data.value.entry.name : (course?.name ?? context.data.value.entry.name)"
      >
        <p class="muted">
          {{ context.data.value.names.get(context.data.value.entry.school_id)?.name ?? t('common.unknown') }} · {{ term?.name ?? t('academic.offerings.unknownTerm') }}
        </p>
        <template #actions>
          <RouterLink
            v-if="course"
            class="btn"
            :to="`/courses/${encodeURIComponent(course.id)}`"
          >
            {{ t('academic.offerings.courseHome') }}
          </RouterLink>
          <RouterLink
            v-if="isClass"
            class="btn btn-ghost"
            :to="`/offerings/${encodeURIComponent(context.data.value.offering.id)}`"
          >
            {{ t('academic.offerings.allClasses') }}
          </RouterLink>
        </template>
      </PageHeader>

      <section class="section">
        <h2>{{ t('academic.offerings.teachers') }}</h2>
        <PagedState
          :status="teachers.status.value"
          :error="teachers.error.value"
          :count="teachers.items.value.length"
          :next="teachers.next.value"
          :appending="teachers.appending.value"
          :empty-text="t('academic.offerings.noTeachers')"
          @retry="teachers.reload"
          @more="teachers.loadMore"
        >
          <ul class="row chips">
            <li
              v-for="item in teachers.items.value"
              :key="item.id"
            >
              <RouterLink
                class="btn btn-sm"
                :to="`/teachers/${encodeURIComponent(item.id)}`"
              >
                {{ item.name }}
              </RouterLink>
            </li>
          </ul>
        </PagedState>
      </section>

      <section class="section">
        <h2>{{ t(isClass ? 'academic.offerings.schedule' : 'academic.offerings.classes') }}</h2>
        <PagedState
          :status="rows.status.value"
          :error="rows.error.value"
          :count="rows.items.value.length"
          :next="rows.next.value"
          :appending="rows.appending.value"
          :empty-text="t(isClass ? 'academic.offerings.noSchedule' : 'academic.offerings.noClasses')"
          @retry="rows.reload"
          @more="rows.loadMore"
        >
          <div
            v-if="isClass"
            class="table-wrap"
          >
            <table class="table">
              <thead>
                <tr>
                  <th scope="col">
                    {{ t('academic.offerings.time') }}
                  </th>
                  <th scope="col">
                    {{ t('academic.offerings.location') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in rows.items.value"
                  :key="item.id"
                >
                  <td>{{ item.time_text || t('common.notProvided') }}</td>
                  <td>{{ item.location || t('common.notProvided') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul
            v-else
            class="grid chips"
          >
            <li
              v-for="item in rows.items.value"
              :key="item.id"
            >
              <RouterLink
                class="card card-link stack-sm"
                :to="`/classes/${encodeURIComponent(item.id)}`"
              >
                <span class="card-title">{{ item.name }}</span>
                <span
                  v-if="item.code"
                  class="small muted mono"
                >{{ item.code }}</span>
              </RouterLink>
            </li>
          </ul>
        </PagedState>
      </section>
    </div>
  </AsyncState>
</template>

<style scoped>
.chips { list-style: none; }
</style>
