<script setup lang="ts">
import { computed, reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync, usePaged } from '../../shared/composables/async'
import PageHeader from '../../shared/ui/PageHeader.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { knownCredits, listSize, useAcademic, type CatalogObject } from './api'

// Course or teacher directory. Filters live in the URL so results can be shared.
const props = defineProps<{ kind: 'course' | 'teacher' }>()
const { t } = useI18n()
const format = useFormat()
const route = useRoute()
const router = useRouter()
const api = useAcademic()
const keys = ['q', 'school', 'department', 'category', 'nature', 'teacher'] as const
type Filters = Record<(typeof keys)[number], string>
const form = reactive<Filters>({ q: '', school: '', department: '', category: '', nature: '', teacher: '' })
const names = shallowRef(new Map<string, CatalogObject>())

function fromRoute(): Filters {
  const read = (key: string) => (typeof route.query[key] === 'string' ? String(route.query[key]) : '')
  return { q: read('q'), school: read('school'), department: read('department'), category: props.kind === 'course' ? read('category') : '', nature: props.kind === 'course' ? read('nature') : '', teacher: props.kind === 'course' ? read('teacher') : '' }
}
const applied = computed(fromRoute)
const filtered = computed(() => keys.some((key) => applied.value[key]))

const results = usePaged(async (after, signal) => {
  const f = applied.value
  const page = await api.objects({ kind: props.kind, q: f.q, school_id: f.school, department_id: f.department, category_id: f.category, nature_id: f.nature, teacher_id: f.teacher, after, limit: listSize }, signal)
  const found = await api.lookup(page.items.flatMap((item) => [item.school_id, item.department_id]), signal)
  names.value = new Map([...(after ? names.value : []), ...found])
  return { items: page.items, next: page.next }
})

const schools = useAsync((signal) => api.options({ kind: 'school' }, signal))
// Departments, categories and natures belong to one school.
const scoped = useAsync(async (signal) => {
  const school = form.school
  if (!school) return { departments: [], categories: [], natures: [] }
  const [departments, categories, natures] = await Promise.all([
    api.options({ kind: 'department', school_id: school }, signal),
    props.kind === 'course' ? api.options({ kind: 'category', school_id: school }, signal) : Promise.resolve([]),
    props.kind === 'course' ? api.options({ kind: 'nature', school_id: school }, signal) : Promise.resolve([]),
  ])
  return { departments, categories, natures }
})
const teacherName = useAsync(async (signal) => (applied.value.teacher ? (await api.lookup([applied.value.teacher], signal)).get(applied.value.teacher)?.name ?? '' : ''))

function apply(changes: Partial<Filters> = {}) {
  Object.assign(form, changes)
  const query: Record<string, string> = {}
  for (const key of keys) if (form[key]) query[key] = form[key]
  if (typeof route.query.lang === 'string') query.lang = route.query.lang
  void router.replace({ path: route.path, query })
}

function changeSchool() {
  apply({ department: '', category: '', nature: '', teacher: '' })
}

watch(() => [props.kind, route.query], () => {
  Object.assign(form, fromRoute())
  void results.reload()
  void teacherName.reload()
}, { immediate: true, deep: true })
watch(() => [props.kind, form.school], () => void scoped.reload(), { immediate: true })
void schools.reload()
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :eyebrow="t('academic.directory.eyebrow')"
      :title="t(kind === 'course' ? 'nav.courses' : 'nav.teachers')"
      :description="t(kind === 'course' ? 'academic.directory.courseIntro' : 'academic.directory.teacherIntro')"
    />

    <form
      class="card filters"
      role="search"
      @submit.prevent="apply()"
    >
      <div class="form-grid">
        <label class="field search-field">
          <span class="field-label">{{ t('academic.directory.search') }}</span>
          <input
            v-model="form.q"
            class="input"
            type="search"
            maxlength="200"
            :placeholder="t(kind === 'course' ? 'academic.directory.courseSearchHint' : 'academic.directory.teacherSearchHint')"
          >
        </label>
        <label class="field">
          <span class="field-label">{{ t('academic.directory.school') }}</span>
          <select
            v-model="form.school"
            class="select"
            @change="changeSchool"
          >
            <option value="">{{ t('common.all') }}</option>
            <option
              v-for="item in schools.data.value"
              :key="item.id"
              :value="item.id"
            >{{ item.name }}</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">{{ t(kind === 'course' ? 'academic.directory.college' : 'academic.directory.department') }}</span>
          <select
            v-model="form.department"
            class="select"
            :disabled="!form.school"
            @change="apply()"
          >
            <option value="">{{ t('common.all') }}</option>
            <option
              v-for="item in scoped.data.value?.departments"
              :key="item.id"
              :value="item.id"
            >{{ item.name }}</option>
          </select>
        </label>
        <template v-if="kind === 'course'">
          <label class="field">
            <span class="field-label">{{ t('academic.directory.category') }}</span>
            <select
              v-model="form.category"
              class="select"
              :disabled="!form.school"
              @change="apply()"
            >
              <option value="">{{ t('common.all') }}</option>
              <option
                v-for="item in scoped.data.value?.categories"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">{{ t('academic.directory.nature') }}</span>
            <select
              v-model="form.nature"
              class="select"
              :disabled="!form.school"
              @change="apply()"
            >
              <option value="">{{ t('common.all') }}</option>
              <option
                v-for="item in scoped.data.value?.natures"
                :key="item.id"
                :value="item.id"
              >{{ item.name }}</option>
            </select>
          </label>
        </template>
      </div>
      <div class="row-between">
        <p
          v-if="applied.teacher"
          class="small muted"
        >
          {{ t('academic.directory.taughtBy', { name: teacherName.data.value || t('common.unknown') }) }}
        </p>
        <span v-else />
        <div class="form-actions">
          <button
            v-if="filtered"
            class="btn btn-ghost"
            type="button"
            @click="apply({ q: '', school: '', department: '', category: '', nature: '', teacher: '' })"
          >
            {{ t('common.clearFilters') }}
          </button>
          <button
            class="btn btn-primary"
            type="submit"
          >
            {{ t('common.search') }}
          </button>
        </div>
      </div>
      <p
        v-if="schools.status.value === 'error' || scoped.status.value === 'error'"
        class="field-error"
      >
        {{ t('academic.directory.filtersUnavailable') }}
      </p>
    </form>

    <PagedState
      :status="results.status.value"
      :error="results.error.value"
      :count="results.items.value.length"
      :next="results.next.value"
      :appending="results.appending.value"
      :empty-text="t(filtered ? 'academic.directory.noMatch' : 'academic.directory.empty')"
      @retry="results.reload"
      @more="results.loadMore"
    >
      <ul class="grid results">
        <li
          v-for="item in results.items.value"
          :key="item.id"
        >
          <RouterLink
            class="card card-link result"
            :to="`/${kind === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(item.id)}`"
          >
            <span class="card-title">{{ item.name }}</span>
            <span class="small muted">{{ names.get(item.school_id)?.name ?? t('common.unknown') }}<template v-if="item.department_id"> · {{ names.get(item.department_id)?.name ?? t('common.unknown') }}</template></span>
            <span
              v-if="kind === 'course'"
              class="row small"
            >
              <span
                v-if="item.code"
                class="tag mono"
              >{{ item.code }}</span>
              <span class="tag">{{ knownCredits(item) === undefined ? t('academic.subject.creditsUnknown') : t('academic.subject.credits', { credits: format.number(knownCredits(item) ?? 0) }) }}</span>
            </span>
            <span
              v-if="item.inactive"
              class="tag tag-warning"
            >{{ t('academic.subject.inactive') }}</span>
          </RouterLink>
        </li>
      </ul>
    </PagedState>
  </div>
</template>

<style scoped>
.filters { display: grid; gap: 1rem; }
.search-field { grid-column: span 2; }
@media (max-width: 640px) { .search-field { grid-column: auto; } }
.results { list-style: none; }
.result { display: grid; gap: .4rem; height: 100%; align-content: start; }
</style>
