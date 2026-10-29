<script setup lang="ts">
import { computed,watch } from 'vue'
import { RouterLink,useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { call,lookupObjects,type Review } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import ReviewCard from './ReviewCard.vue'
const route=useRoute(),{t}=useI18n(),id=computed(()=>String(route.params.id))
const data=useLoad(async signal=>{const entry=await call<Review>('reviews',`/me/entries/${encodeURIComponent(id.value)}`,'View',{signal});return {entry,references:await lookupObjects([entry.target_id,entry.term_id,entry.teacher_id],signal)}})
watch(id,()=>{void data.load()},{immediate:true})
</script>
<template>
  <section class="academic-page">
    <RouterLink to="/community/me">
      {{ t('academic.myCommunity') }}
    </RouterLink><h1>{{ t('academic.viewOwnEntry') }}</h1><LoadState
      :busy="data.busy.value"
      :error="data.error.value"
      @retry="data.load"
    /><ReviewCard
      v-if="data.data.value"
      :review="data.data.value.entry"
      :references="data.data.value.references"
      standalone
      @changed="data.load"
    />
  </section>
</template>
