<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute,useRouter,RouterLink } from 'vue-router'
import { objects,objectOptions,lookupObjects } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
const {t,n}=useI18n(),route=useRoute(),router=useRouter()
const kind=computed(()=>route.path==='/teachers'?'teacher':'course')
const school=ref(''),department=ref(''),category=ref(''),nature=ref(''),search=ref(''),teacher=ref(''),after=ref('')
const directory=useLoad(async signal=>{
  const page=await objects({kind:kind.value,school_id:school.value,department_id:department.value,category_id:kind.value==='course'?category.value:'',nature_id:kind.value==='course'?nature.value:'',teacher_id:kind.value==='course'?teacher.value:'',q:search.value,after:after.value,limit:'24'},signal)
  const references=await lookupObjects(page.items.flatMap(item=>[item.school_id,item.department_id]),signal)
  return {page,references}
})
const filters=useLoad(async signal=>{
  const [schools,departments,categories,natures]=await Promise.all(['school','department','category','nature'].map(kind=>objectOptions({kind,school_id:kind==='school'?'':school.value},signal)))
  const selected=await lookupObjects([teacher.value],signal)
  return {schools,departments,categories,natures,selected}
})
function read(key:string){const value=route.query[key];return typeof value==='string'?value:''}
watch(()=>route.fullPath,()=>{school.value=read('school');department.value=read('department');category.value=read('category');nature.value=read('nature');search.value=read('q');teacher.value=read('teacher');after.value=read('after');void filters.load();void directory.load()},{immediate:true})
function apply(cursor=''){
  const values={lang:read('lang'),school:school.value,department:department.value,category:kind.value==='course'?category.value:'',nature:kind.value==='course'?nature.value:'',teacher:kind.value==='course'?teacher.value:'',q:search.value,after:cursor}
  const query=Object.fromEntries(Object.entries(values).filter(([,value])=>!!value))
  void router.push({path:route.path,query})
  if(cursor===after.value&&JSON.stringify(query)===JSON.stringify(route.query))void directory.load()
}
function next(){apply(directory.data.value?.page.next??'')}
function changeSchool(){department.value='';category.value='';nature.value='';teacher.value='';apply()}
function clear(){school.value='';department.value='';category.value='';nature.value='';search.value='';teacher.value='';apply()}
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
      @submit.prevent="apply()"
    >
      <label>{{ t('academic.search') }}<input
        v-model="search"
        type="search"
        maxlength="200"
      ></label>
      <label>{{ t('academic.school') }}<select
        v-model="school"
        @change="changeSchool"
      ><option value="">{{ t('academic.all') }}</option><option
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
      </button><button
        v-if="school||department||category||nature||search||teacher"
        type="button"
        @click="clear"
      >
        {{ t('academic.clearFilters') }}
      </button>
      <p
        v-if="teacher"
        class="academic-muted"
      >
        {{ t('academic.taughtBy') }} {{ filters.data.value?.selected.get(teacher)?.name??t('academic.unknown') }}
      </p>
    </form>
    <LoadState
      :busy="filters.busy.value"
      :error="filters.error.value"
      @retry="filters.load"
    />
    <LoadState
      :busy="directory.busy.value"
      :error="directory.error.value"
      :empty="directory.data.value?.page.items.length === 0"
      @retry="directory.load"
    />
    <ul class="academic-grid">
      <li
        v-for="item in directory.data.value?.page.items"
        :key="item.id"
        class="academic-card"
      >
        <RouterLink :to="`/${kind === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(item.id)}`">
          <h2>{{ item.name }}</h2>
        </RouterLink><p class="academic-muted">
          {{ directory.data.value?.references.get(item.school_id)?.name??t('academic.unknown') }} {{ directory.data.value?.references.get(item.department_id??'')?.name??t('academic.unknown') }}
        </p><p>{{ item.code }}</p><p v-if="kind === 'course'">
          {{ item.credits === null ? t('academic.unknownCredits') : t('academic.credits', { credits:n(item.credits) }) }}
        </p>
      </li>
    </ul>
    <div class="academic-actions">
      <button
        v-if="after"
        @click="apply()"
      >
        {{ t('academic.first') }}
      </button><button
        v-if="directory.data.value?.page.next"
        @click="next"
      >
        {{ t('academic.next') }}
      </button>
    </div>
  </section>
</template>
