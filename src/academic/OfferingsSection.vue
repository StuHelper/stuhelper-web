<script setup lang="ts">
import { ref,watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { objects,objectOptions,lookupObjects } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
const props=defineProps<{courseId?:string;teacherId?:string;schoolId:string}>()
const {t}=useI18n()
const term=ref(''),after=ref('')
const terms=useLoad(signal=>objectOptions({kind:'term',school_id:props.schoolId},signal))
const data=useLoad(async signal=>{
  const page=await objects({kind:'term_course',course_id:props.courseId,teacher_id:props.teacherId,term_id:term.value,after:after.value,limit:'20'},signal)
  const references=await lookupObjects(page.items.flatMap(item=>[item.course_id,item.term_id]),signal)
  return {page,references}
})
function refresh(){after.value='';void data.load()}
watch(()=>[props.courseId,props.teacherId,props.schoolId],()=>{term.value='';void terms.load();refresh()},{immediate:true})
function next(){after.value=data.data.value?.page.next??'';void data.load()}
</script>
<template>
  <section>
    <div class="section-heading">
      <h2>{{ t('academic.offerings') }}</h2><label>{{ t('academic.offeringTerm') }}<select
        v-model="term"
        @change="refresh"
      ><option value="">{{ t('academic.all') }}</option><option
        v-for="item in terms.data.value?.items"
        :key="item.id"
        :value="item.id"
      >{{ item.name }}</option></select></label>
    </div>
    <p class="academic-muted">
      {{ t('academic.historyIntro') }}
    </p>
    <LoadState
      :busy="terms.busy.value"
      :error="terms.error.value"
      @retry="terms.load"
    />
    <LoadState
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
        <RouterLink :to="`/offerings/${encodeURIComponent(item.id)}`">
          <h3>{{ courseId?data.data.value?.references.get(item.term_id??'')?.name:data.data.value?.references.get(item.course_id??'')?.name??item.name }}</h3>
        </RouterLink><p v-if="!courseId">
          {{ data.data.value?.references.get(item.term_id??'')?.name??t('academic.unknown') }}
        </p>
      </li>
    </ul>
    <div class="academic-actions">
      <button
        v-if="after"
        @click="refresh"
      >
        {{ t('academic.first') }}
      </button><button
        v-if="data.data.value?.page.next"
        @click="next"
      >
        {{ t('academic.next') }}
      </button>
    </div>
  </section>
</template>
