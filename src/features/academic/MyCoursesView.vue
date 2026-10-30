<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import TabBar from '../../shared/ui/TabBar.vue'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic, type CatalogObject, type Enrollment } from './api'

// Personal courses by term, from trusted enrollment records. Time and place come
// from the teaching class when it is known; missing facts stay visibly missing.
const { t } = useI18n()
const format = useFormat()
const api = useAcademic()
const term = ref('')
const schedules = shallowRef(new Map<string, CatalogObject[]>())

const data = useAsync(async (signal) => {
  const rows = (await api.myEnrollments({}, signal)).filter((row) => row.active)
  const names = await api.lookup(rows.flatMap((row) => [row.course_id, row.term_id, row.class_id, ...row.teacher_ids]), signal)
  return { rows, names }
})
const terms = computed(() => {
  const seen = [...new Set((data.data.value?.rows ?? []).map((row) => row.term_id))]
  return seen.map((value) => ({ value, label: data.data.value?.names.get(value)?.name ?? t('academic.offerings.unknownTerm') }))
})
const rows = computed(() => (data.data.value?.rows ?? []).filter((row) => row.term_id === term.value))
const fetched = computed(() => rows.value.map((row) => row.fetched_at).filter((value): value is string => !!value).sort().at(-1))

const times = useAsync(async (signal) => {
  const classes = [...new Set(rows.value.map((row) => row.class_id).filter((id): id is string => !!id))]
  const found = await Promise.all(classes.map(async (id) => [id, (await api.objects({ kind: 'schedule', class_id: id, limit: 20 }, signal)).items] as const))
  schedules.value = new Map(found)
  return true
})

watch(terms, (list) => {
  if (!list.some((item) => item.value === term.value)) term.value = list.at(-1)?.value ?? ''
})
watch(term, () => {
  schedules.value = new Map()
  void times.reload()
})
onMounted(data.reload)

const name = (id?: string) => (id ? data.data.value?.names.get(id)?.name : undefined)
const key = (row: Enrollment) => row.id
</script>

<template>
  <MeLayout
    :title="t('courses.title')"
    :description="t('courses.intro')"
  >
    <AsyncState
      :status="data.status.value"
      :error="data.error.value"
      :empty="!data.data.value?.rows.length"
      :empty-text="t('courses.empty')"
      :retry-label="t('courses.reload')"
      @retry="data.reload"
    >
      <div class="stack">
        <TabBar
          v-if="terms.length"
          v-model="term"
          :tabs="terms"
          :label="t('academic.feed.term')"
          id-prefix="my-courses"
        />
        <div
          id="my-courses-panel"
          role="tabpanel"
          :aria-labelledby="`my-courses-tab-${term}`"
          class="stack"
        >
          <p
            v-if="times.status.value === 'error'"
            class="notice notice-warning"
            role="alert"
          >
            <span>{{ t('courses.timesFailed') }}</span>
            <button
              class="btn btn-sm"
              type="button"
              @click="times.reload"
            >
              {{ t('courses.timesRetry') }}
            </button>
          </p>
          <ul class="list">
            <li
              v-for="row in rows"
              :key="key(row)"
              class="card stack-sm"
            >
              <RouterLink
                class="card-title"
                :to="`/courses/${encodeURIComponent(row.course_id)}`"
              >
                {{ name(row.course_id) ?? t('common.unknown') }}
              </RouterLink>
              <p class="small muted">
                <template v-if="row.teacher_ids.length">
                  <template
                    v-for="(id, index) in row.teacher_ids"
                    :key="id"
                  >
                    <template v-if="index">
                      ·
                    </template>
                    <RouterLink :to="`/teachers/${encodeURIComponent(id)}`">
                      {{ name(id) ?? t('common.unknown') }}
                    </RouterLink>
                  </template>
                </template>
                <template v-else>
                  {{ t('courses.noTeacher') }}
                </template>
              </p>
              <p
                v-if="row.class_id && schedules.get(row.class_id)?.length"
                class="small"
              >
                <template
                  v-for="item in schedules.get(row.class_id)"
                  :key="item.id"
                >
                  {{ item.time_text || t('common.notProvided') }} · {{ item.location || t('common.notProvided') }}<br>
                </template>
              </p>
              <p
                v-else-if="times.status.value !== 'loading'"
                class="small muted"
              >
                {{ t('courses.noTime') }}
              </p>
              <div class="row">
                <RouterLink
                  v-if="row.class_id"
                  class="btn btn-sm"
                  :to="`/classes/${encodeURIComponent(row.class_id)}`"
                >
                  {{ t('courses.classLink') }}
                </RouterLink>
                <RouterLink
                  class="btn btn-sm"
                  :to="{ path: '/resources', query: { course_id: row.course_id } }"
                >
                  {{ t('academic.subject.resources') }}
                </RouterLink>
              </div>
            </li>
          </ul>
          <p
            v-if="fetched"
            class="subtle"
          >
            {{ t('courses.updated', { time: format.dateTime(fetched) }) }}
          </p>
        </div>
      </div>
    </AsyncState>
  </MeLayout>
</template>
