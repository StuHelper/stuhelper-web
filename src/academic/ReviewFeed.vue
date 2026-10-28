<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { call, lookupObjects, objectOptions, query, type ReviewPage } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import ReviewCard from './ReviewCard.vue'

const props=defineProps<{kind:'course'|'mentor';targetId?:string;teacherId?:string;schoolId?:string;filterable?:boolean}>()
const {t}=useI18n()
const term=ref(''),teacher=ref(''),sort=ref('newest'),after=ref(''),history=ref<string[]>([])
const data=useLoad(async signal=>{
  const page=await call<ReviewPage>('reviews',query({kind:props.kind,target_id:props.targetId,teacher_id:props.teacherId||teacher.value,term_id:term.value,sort:sort.value,after:after.value,limit:'20'}),'Page',{signal})
  const references=await lookupObjects(page.items.flatMap(row=>[row.target_id,row.term_id,row.teacher_id]),signal)
  return {page,references}
})
const options=useLoad(async signal=>{
  if(!props.filterable||props.kind!=='course')return {terms:[],teachers:[]}
  const [terms,teachers]=await Promise.all([
    objectOptions({kind:'term',school_id:props.schoolId},signal),
    props.teacherId?Promise.resolve({items:[]}):objectOptions({kind:'teacher',course_id:props.targetId,school_id:props.schoolId},signal),
  ])
  return {terms:terms.items,teachers:teachers.items}
})
function refresh(){after.value='';history.value=[];void data.load()}
function next(){if(data.data.value?.page.next){history.value.push(after.value);after.value=data.data.value.page.next;void data.load()}}
function previous(){after.value=history.value.pop()??'';void data.load()}
watch(()=>[props.kind,props.targetId,props.teacherId,props.schoolId],()=>{term.value='';teacher.value='';refresh();void options.load()},{immediate:true})
defineExpose({refresh})
</script>
<template>
  <div class="review-feed">
    <form
      class="academic-filters compact-filters"
      @submit.prevent="refresh"
    >
      <template v-if="filterable && kind==='course'">
        <label>{{ t('academic.reviewTerm') }}<select v-model="term"><option value="">{{ t('academic.all') }}</option><option
          v-for="item in options.data.value?.terms"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option></select></label>
        <label v-if="!teacherId">{{ t('academic.taughtBy') }}<select v-model="teacher"><option value="">{{ t('academic.all') }}</option><option
          v-for="item in options.data.value?.teachers"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option></select></label>
      </template>
      <label>{{ t('academic.sort') }}<select v-model="sort"><option value="newest">{{ t('academic.newest') }}</option><option value="oldest">{{ t('academic.oldest') }}</option></select></label>
      <button type="submit">
        {{ t('academic.filter') }}
      </button>
    </form>
    <LoadState
      :busy="options.busy.value"
      :error="options.error.value"
      @retry="options.load"
    />
    <LoadState
      :busy="data.busy.value"
      :error="data.error.value"
      :empty="data.data.value?.page.items.length===0"
      @retry="data.load"
    />
    <ReviewCard
      v-for="review in data.data.value?.page.items"
      :key="review.id"
      :review="review"
      :references="data.data.value?.references"
      @changed="data.load"
    />
    <div class="academic-actions">
      <button
        v-if="history.length"
        :disabled="data.busy.value"
        @click="previous"
      >
        {{ t('academic.previous') }}
      </button>
      <button
        v-if="data.data.value?.page.next"
        :disabled="data.busy.value"
        @click="next"
      >
        {{ t('academic.next') }}
      </button>
    </div>
  </div>
</template>
