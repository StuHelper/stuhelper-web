<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { RouterLink,useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AcademicError,object,objects,lookupObjects } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
const route=useRoute(),{t}=useI18n()
const id=computed(()=>String(route.params.id)),isClass=computed(()=>route.path.startsWith('/classes/'))
const after=ref(''),teacherAfter=ref('')
const context=useLoad(async signal=>{
  const entry=await object(id.value,signal)
  if(entry.kind!==(isClass.value?'class':'term_course'))throw new AcademicError('not_found')
  const offering=isClass.value?await object(entry.term_course_id??'',signal):entry
  if(offering.kind!=='term_course'||offering.school_id!==entry.school_id)throw new AcademicError('incompatible')
  const refs=await lookupObjects([offering.course_id,offering.term_id,entry.department_id,entry.category_id,entry.nature_id],signal)
  return {entry,offering,refs}
})
const teachers=useLoad(signal=>objects({kind:'teacher',class_id:isClass.value?id.value:'',term_course_id:isClass.value?'':id.value,after:teacherAfter.value},signal))
const data=useLoad(async signal=>{
  const page=await objects({kind:isClass.value?'schedule':'class',class_id:isClass.value?id.value:'',term_course_id:isClass.value?'':id.value,after:after.value},signal)
  const refs=await lookupObjects(page.items.flatMap(item=>[item.category_id,item.nature_id]),signal)
  return {page,refs}
})
watch(id,()=>{after.value='';teacherAfter.value='';void context.load();void teachers.load();void data.load()},{immediate:true})
</script>
<template>
  <section class="academic-page">
    <LoadState
      :busy="context.busy.value"
      :error="context.error.value"
      @retry="context.load"
    />
    <template v-if="context.data.value">
      <header>
        <RouterLink :to="`/courses/${encodeURIComponent(context.data.value.offering.course_id??'')}`">
          {{ t('academic.backToCourse') }}
        </RouterLink><p class="eyebrow">
          {{ t(isClass?'academic.classDetails':'academic.offering') }}
        </p><h1>{{ isClass?context.data.value.entry.name:context.data.value.refs.get(context.data.value.offering.course_id??'')?.name??context.data.value.entry.name }}</h1><p>{{ context.data.value.refs.get(context.data.value.offering.term_id??'')?.name??t('academic.unknown') }}</p>
      </header>
      <section>
        <h2>{{ t('academic.taughtBy') }}</h2><LoadState
          :busy="teachers.busy.value"
          :error="teachers.error.value"
          :empty="teachers.data.value?.items.length===0"
          @retry="teachers.load"
        /><ul class="academic-grid">
          <li
            v-for="teacher in teachers.data.value?.items"
            :key="teacher.id"
            class="academic-card"
          >
            <RouterLink :to="`/teachers/${encodeURIComponent(teacher.id)}`">
              {{ teacher.name }}
            </RouterLink>
          </li>
        </ul><div class="academic-actions">
          <button
            v-if="teacherAfter"
            @click="teacherAfter='';teachers.load()"
          >
            {{ t('academic.first') }}
          </button><button
            v-if="teachers.data.value?.next"
            @click="teacherAfter=teachers.data.value.next;teachers.load()"
          >
            {{ t('academic.next') }}
          </button>
        </div>
      </section>
      <section>
        <h2>{{ t(isClass?'academic.schedule':'academic.classes') }}</h2><LoadState
          :busy="data.busy.value"
          :error="data.error.value"
          :empty="data.data.value?.page.items.length===0"
          @retry="data.load"
        />
        <ul class="academic-grid">
          <li
            v-for="item in data.data.value?.page.items"
            :key="item.id"
            class="academic-card"
          >
            <template v-if="isClass">
              <h3>{{ item.name }}</h3><dl class="academic-facts">
                <div><dt>{{ t('academic.time') }}</dt><dd>{{ item.time_text||t('academic.unknown') }}</dd></div><div><dt>{{ t('academic.location') }}</dt><dd>{{ item.location||t('academic.unknown') }}</dd></div>
              </dl>
            </template>
            <template v-else>
              <RouterLink :to="`/classes/${encodeURIComponent(item.id)}`">
                <h3>{{ item.name }}</h3>
              </RouterLink><p>{{ item.code }}</p><p>{{ t('academic.category') }} {{ data.data.value?.refs.get(item.category_id??'')?.name??t('academic.unknown') }}</p><p>{{ t('academic.nature') }} {{ data.data.value?.refs.get(item.nature_id??'')?.name??t('academic.unknown') }}</p>
            </template>
          </li>
        </ul><div class="academic-actions">
          <button
            v-if="after"
            @click="after='';data.load()"
          >
            {{ t('academic.first') }}
          </button><button
            v-if="data.data.value?.page.next"
            @click="after=data.data.value.page.next;data.load()"
          >
            {{ t('academic.next') }}
          </button>
        </div>
      </section>
    </template>
  </section>
</template>
