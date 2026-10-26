<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, RouterLink } from 'vue-router'
import { objects, objectOptions } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
const { t } = useI18n()
const route = useRoute()
const kind = computed(() => route.path === '/teachers' ? 'teacher' : 'course')
const school = ref(''), department = ref(''), category = ref(''), nature = ref(''), search = ref(''), after = ref('')
const directory = useLoad(signal => objects({ kind: kind.value, school_id: school.value, department_id: department.value, category_id: kind.value === 'course' ? category.value : '', nature_id: kind.value === 'course' ? nature.value : '', q: search.value, after: after.value, limit: '24' }, signal))
const filters = useLoad(async signal => {
  const [schools, departments, categories, natures] = await Promise.all(['school', 'department', 'category', 'nature'].map(kind => objectOptions({kind, school_id:kind === 'school' ? '' : school.value}, signal)))
  return { schools, departments, categories, natures }
})
function apply() { after.value = ''; void directory.load() }
function next() { after.value = directory.data.value?.next ?? ''; void directory.load() }
watch(school, () => { department.value = ''; category.value = ''; nature.value = ''; void filters.load(); apply() })
watch(kind, () => { department.value = ''; category.value = ''; nature.value = ''; search.value = ''; apply() }, { immediate:true })
void filters.load()
</script>
<template>
  <section class="academic-page">
    <header>
      <p class="eyebrow">
        {{ t('academic.community') }}
      </p><h1>{{ t(kind === 'course' ? 'academic.courses' : 'academic.teachers') }}</h1><p>{{ t(kind === 'course' ? 'academic.courseIntro' : 'academic.teacherIntro') }}</p>
    </header>
    <form
      class="academic-filters"
      @submit.prevent="apply"
    >
      <label>{{ t('academic.search') }}<input
        v-model="search"
        type="search"
        maxlength="200"
      ></label>
      <label>{{ t('academic.school') }}<select v-model="school"><option value="">{{ t('academic.all') }}</option><option
        v-for="item in filters.data.value?.schools?.items"
        :key="item.id"
        :value="item.id"
      >{{ item.name }}</option></select></label>
      <label>{{ t(kind === 'course' ? 'academic.college' : 'academic.department') }}<select v-model="department"><option value="">{{ t('academic.all') }}</option><option
        v-for="item in filters.data.value?.departments?.items"
        :key="item.id"
        :value="item.id"
      >{{ item.name }}</option></select></label>
      <template v-if="kind === 'course'">
        <label>{{ t('academic.category') }}<select v-model="category"><option value="">{{ t('academic.all') }}</option><option
          v-for="item in filters.data.value?.categories?.items"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option></select></label><label>{{ t('academic.nature') }}<select v-model="nature"><option value="">{{ t('academic.all') }}</option><option
          v-for="item in filters.data.value?.natures?.items"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option></select></label>
      </template>
      <button type="submit">
        {{ t('academic.filter') }}
      </button>
    </form>
    <LoadState
      :busy="filters.busy.value"
      :error="filters.error.value"
      @retry="filters.load"
    />
    <LoadState
      :busy="directory.busy.value"
      :error="directory.error.value"
      :empty="directory.data.value?.items.length === 0"
      @retry="directory.load"
    />
    <ul class="academic-grid">
      <li
        v-for="item in directory.data.value?.items"
        :key="item.id"
        class="academic-card"
      >
        <RouterLink :to="`/${kind === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(item.id)}`">
          <h2>{{ item.name }}</h2>
        </RouterLink><p>{{ item.code }}</p><p v-if="kind === 'course'">
          {{ item.credits === null ? t('academic.unknownCredits') : t('academic.credits', { credits:item.credits }) }}
        </p>
      </li>
    </ul>
    <div class="academic-actions">
      <button
        v-if="after"
        @click="apply"
      >
        {{ t('academic.first') }}
      </button><button
        v-if="directory.data.value?.next"
        @click="next"
      >
        {{ t('academic.next') }}
      </button>
    </div>
  </section>
</template>
