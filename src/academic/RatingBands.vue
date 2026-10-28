<script setup lang="ts">
import {watch} from 'vue'
import {loadPresentation} from './api'
import {useLoad} from './useLoad'
import { useI18n } from 'vue-i18n'
import type { Statistics } from './api'
const props=withDefaults(defineProps<{ dimensions: Statistics['dimensions']; showSamples?: boolean;schoolId?:string }>(), { showSamples: true,schoolId:undefined })
const { t, n,locale } = useI18n()
const symbols = ['😞','🙁','😐','🙂','😃']
const effort = ['🪶','🌱','🧩','🧗','🏔️']
const names = ['recommendation', 'quality', 'difficulty', 'workload', 'grading'] as const
const settings=useLoad(()=>loadPresentation(props.schoolId??''))
watch(()=>props.schoolId,()=>{if(props.schoolId)void settings.load()},{immediate:true})
function text(index:number,level:number){return level>0?(settings.data.value?.effective.rating_texts[locale.value]?.[index]?.[level]??t(`academic.ratings.${names[index]}.level${level}`)):(settings.data.value?.effective.rating_texts[locale.value]?.[index]?.[0]??t(`academic.ratings.${names[index]}.label`))}
</script>
<template>
  <dl class="rating-bands">
    <div
      v-for="(name,index) in names"
      :key="name"
    >
      <dt>{{ text(index,0) }}</dt><dd><span aria-hidden="true">{{ (dimensions[index]?.level ?? 0)>0 ? (name==='difficulty' || name==='workload' ? effort : symbols)[(dimensions[index]?.level ?? 1)-1] : '' }}</span> {{ (dimensions[index]?.level??0)>0?text(index,dimensions[index]?.level??0):t(`academic.ratings.${name}.level0`) }}<small v-if="showSamples">{{ t('academic.samples', { samples:n(dimensions[index]?.samples ?? 0), courses:n(dimensions[index]?.courses ?? 0) }) }}</small></dd>
    </div>
  </dl>
</template>
