<script setup lang="ts">
import { ChevronRight, Search } from 'lucide-vue-next'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useCampusId } from '../account/access'
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
const campus = useCampusId()
const filtersOpen = ref(false)
const keys = ['q', 'department', 'category', 'nature', 'teacher'] as const
type Filters = Record<(typeof keys)[number], string>
const form = reactive<Filters>({ q: '', department: '', category: '', nature: '', teacher: '' })
const names = shallowRef(new Map<string, CatalogObject>())

function fromRoute(): Filters {
  const read = (key: string) => (typeof route.query[key] === 'string' ? String(route.query[key]) : '')
  return { q: read('q'), department: read('department'), category: props.kind === 'course' ? read('category') : '', nature: props.kind === 'course' ? read('nature') : '', teacher: props.kind === 'course' ? read('teacher') : '' }
}
const applied = computed(fromRoute)
const filtered = computed(() => keys.some((key) => applied.value[key]))

const results = usePaged(async (after, signal) => {
  const f = applied.value
  const page = await api.objects({ kind: props.kind, q: f.q, school_id: campus.value, department_id: f.department, category_id: f.category, nature_id: f.nature, teacher_id: f.teacher, after, limit: listSize }, signal)
  const found = await api.lookup(page.items.flatMap((item) => [item.department_id]), signal)
  names.value = new Map([...(after ? names.value : []), ...found])
  return { items: page.items, next: page.next }
})

const scoped = useAsync(async (signal) => {
  const school = campus.value
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

const active = computed(() => (['department', 'category', 'nature'] as const).filter((key) => applied.value[key]).length)

watch(() => [props.kind, route.query], () => {
  Object.assign(form, fromRoute())
  void results.reload()
  void teacherName.reload()
}, { immediate: true, deep: true })
watch(() => [props.kind, campus.value], () => void scoped.reload(), { immediate: true })
</script>

<template>
  <div class="stack-lg">
    <PageHeader
      :title="t(kind === 'course' ? 'nav.courses' : 'nav.teachers')"
      :description="t(kind === 'course' ? 'academic.directory.courseIntro' : 'academic.directory.teacherIntro')"
    />

    <form
      class="filters"
      role="search"
      @submit.prevent="apply()"
    >
      <div class="search-bar">
        <label class="search-field">
          <span class="visually-hidden">{{ t('academic.directory.search') }}</span>
          <Search aria-hidden="true" />
          <input
            v-model="form.q"
            class="input"
            type="search"
            maxlength="200"
            :placeholder="t(kind === 'course' ? 'academic.directory.courseSearchHint' : 'academic.directory.teacherSearchHint')"
          >
        </label>
        <button
          class="btn btn-primary"
          type="submit"
        >
          {{ t('common.search') }}
        </button>
      </div>
      <button
        class="btn btn-sm filter-toggle"
        type="button"
        :aria-expanded="filtersOpen"
        @click="filtersOpen = !filtersOpen"
      >
        {{ active ? t('common.filtersCount', { count: format.number(active) }) : t('common.filters') }}
      </button>
      <div
        class="filter-row"
        :class="{ open: filtersOpen }"
      >
        <label class="field">
          <span class="field-label">{{ t(kind === 'course' ? 'academic.directory.college' : 'academic.directory.department') }}</span>
          <select
            v-model="form.department"
            class="select"
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
      <div
        v-if="applied.teacher || filtered"
        class="row-between"
      >
        <p class="small muted">
          <template v-if="applied.teacher">
            {{ t('academic.directory.taughtBy', { name: teacherName.data.value || t('common.unknown') }) }}
          </template>
        </p>
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          @click="apply({ q: '', department: '', category: '', nature: '', teacher: '' })"
        >
          {{ t('common.clearFilters') }}
        </button>
      </div>
      <p
        v-if="scoped.status.value === 'error'"
        class="field-error row"
        role="alert"
      >
        <span>{{ t('academic.directory.filtersUnavailable') }}</span>
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          @click="scoped.reload"
        >
          {{ t('academic.directory.filtersRetry') }}
        </button>
      </p>
    </form>

    <PagedState
      :status="results.status.value"
      :error="results.error.value"
      :count="results.items.value.length"
      :next="results.next.value"
      :appending="results.appending.value"
      :retry-label="t(kind === 'course' ? 'academic.directory.reloadCourses' : 'academic.directory.reloadTeachers')"
      :empty-text="t(filtered ? 'academic.directory.noMatch' : 'academic.directory.empty')"
      @retry="results.reload"
      @more="results.loadMore"
    >
      <ul class="group">
        <li
          v-for="item in results.items.value"
          :key="item.id"
        >
          <RouterLink
            class="group-row"
            :to="`/${kind === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(item.id)}`"
          >
            <span class="group-body">
              <span class="group-title">{{ item.name }}</span>
              <span
                v-if="item.department_id"
                class="group-detail"
              >{{ names.get(item.department_id)?.name ?? t('common.unknown') }}</span>
            </span>
            <span class="row result-meta">
              <span
                v-if="item.inactive"
                class="tag tag-warning"
              >{{ t('academic.subject.inactive') }}</span>
              <span
                v-if="kind === 'course' && item.code"
                class="tag mono"
              >{{ item.code }}</span>
              <span
                v-if="kind === 'course'"
                class="tag"
              >{{ knownCredits(item) === undefined ? t('academic.subject.creditsUnknown') : t('academic.subject.credits', { credits: format.number(knownCredits(item) ?? 0) }) }}</span>
            </span>
            <ChevronRight
              class="chevron"
              aria-hidden="true"
            />
          </RouterLink>
        </li>
      </ul>
    </PagedState>
  </div>
</template>

<style scoped>
.filters { display: grid; gap: .875rem; }
.search-bar { display: flex; gap: .625rem; }
.search-field { position: relative; display: flex; flex: 1; align-items: center; min-width: 0; }
.search-field svg { position: absolute; inset-inline-start: .875rem; width: 1.125rem; height: 1.125rem; color: var(--label-3); pointer-events: none; }
.search-field .input { padding-inline-start: 2.5rem; border-radius: var(--pill); }
.filter-toggle { display: none; justify-self: start; }
.filter-row { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr)); }
.result-meta { flex: none; max-width: 45%; justify-content: flex-end; }
@media (max-width: 560px) {
  .filter-toggle { display: inline-flex; }
  .filter-row { display: none; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .filter-row.open { display: grid; }
  .group-row { flex-wrap: wrap; }
  .result-meta { order: 3; flex-basis: 100%; max-width: none; justify-content: flex-start; }
}
</style>
