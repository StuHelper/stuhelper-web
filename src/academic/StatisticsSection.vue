<script setup lang="ts">
import { ref,watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { call,lookupObjects,query,type Statistics } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import RatingBands from './RatingBands.vue'
const props=defineProps<{kind:'course'|'teacher';targetId:string}>()
const {t,d}=useI18n()
const range=ref('all'),after=ref(''),from=ref(''),until=ref('')
const data=useLoad(async signal=>{
  const stats=await call<Statistics>('reviews','/statistics'+query({kind:props.kind,target_id:props.targetId,from:from.value,until:until.value,after:after.value}),'Statistics',{signal})
  const references=await lookupObjects(stats.courses.map(row=>row.course_id),signal)
  return {stats,references}
})
function refresh(){after.value='';void data.load()}
function changeRange(){const now=new Date();from.value=range.value==='all'?'':new Date(now.getTime()-Number(range.value)*86400000).toISOString();until.value=range.value==='all'?'':now.toISOString();refresh()}
function next(){after.value=data.data.value?.stats.next??'';void data.load()}
watch(()=>[props.kind,props.targetId],()=>{range.value='all';changeRange()},{immediate:true})
defineExpose({refresh})
</script>
<template>
  <section class="statistics-section">
    <div class="section-heading">
      <h2>{{ t('academic.ratingSummary') }}</h2><label>{{ t('academic.statisticsRange') }}<select
        v-model="range"
        @change="changeRange"
      ><option value="all">{{ t('academic.rangeAll') }}</option><option value="30">{{ t('academic.rangeMonth') }}</option><option value="365">{{ t('academic.rangeYear') }}</option></select></label>
    </div>
    <p class="academic-muted">
      {{ t(kind==='teacher'?'academic.teacherRatingHint':'academic.ratingScope') }}
    </p>
    <p
      v-if="data.data.value?.stats.from && data.data.value.stats.until"
      class="academic-muted"
    >
      {{ t('academic.periodLabel',{from:d(new Date(data.data.value.stats.from),'dateTime'),until:d(new Date(data.data.value.stats.until),'dateTime')}) }}
    </p>
    <LoadState
      :busy="data.busy.value"
      :error="data.error.value"
      @retry="data.load"
    />
    <RatingBands
      v-if="data.data.value"
      :dimensions="data.data.value.stats.dimensions"
    />
    <template v-if="kind==='teacher' && data.data.value?.stats.courses.length">
      <h3>{{ t('academic.ratedCourses') }}</h3>
      <article
        v-for="row in data.data.value.stats.courses"
        :key="row.course_id"
        class="academic-card"
      >
        <RouterLink :to="`/courses/${encodeURIComponent(row.course_id)}`">
          {{ data.data.value.references.get(row.course_id)?.name??t('academic.viewCourse') }}
        </RouterLink><RatingBands :dimensions="row.dimensions" />
      </article>
      <div class="academic-actions">
        <button
          v-if="after"
          @click="refresh"
        >
          {{ t('academic.first') }}
        </button><button
          v-if="data.data.value.stats.next"
          @click="next"
        >
          {{ t('academic.next') }}
        </button>
      </div>
    </template>
  </section>
</template>
