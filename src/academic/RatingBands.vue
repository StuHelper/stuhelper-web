<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Statistics } from './api'
defineProps<{ dimensions: Statistics['dimensions'] }>()
const { t, n } = useI18n()
const symbols = ['😞','🙁','😐','🙂','😃']
const effort = ['🪶','🌱','🧩','🧗','🏔️']
const names = ['recommendation', 'quality', 'difficulty', 'workload', 'grading'] as const
</script>
<template>
  <dl class="rating-bands">
    <div
      v-for="(name,index) in names"
      :key="name"
    >
      <dt>{{ t(`academic.ratings.${name}.label`) }}</dt><dd><span aria-hidden="true">{{ (dimensions[index]?.level ?? 0)>0 ? (name==='difficulty' || name==='workload' ? effort : symbols)[(dimensions[index]?.level ?? 1)-1] : '' }}</span> {{ t(`academic.ratings.${name}.level${dimensions[index]?.level ?? 0}`) }}<small>{{ t('academic.samples', { samples:n(dimensions[index]?.samples ?? 0), courses:n(dimensions[index]?.courses ?? 0) }) }}</small></dd>
    </div>
  </dl>
</template>
