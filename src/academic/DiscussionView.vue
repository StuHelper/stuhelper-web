<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { call, query, type Review, type ReviewPage } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'
const { t } = useI18n(), route = useRoute()
const id = computed(() => String(route.params.id)), after = ref('')
const root = useLoad(signal => call<Review>('reviews','/'+encodeURIComponent(id.value),'View',{signal}))
const replies = useLoad(signal => call<ReviewPage>('reviews',query({kind:'reply',root_id:id.value,after:after.value}),'Page',{signal}))
function refresh(){ void root.load();void replies.load() }
watch(id,()=>{after.value='';refresh()},{immediate:true})
function next(){after.value=replies.data.value?.next ?? '';void replies.load()}
</script>
<template>
  <section class="academic-page">
    <h1>{{ t('academic.discussion') }}</h1><LoadState
      :busy="root.busy.value"
      :error="root.error.value"
      @retry="refresh"
    /><template v-if="root.data.value">
      <ReviewCard
        :review="root.data.value"
        standalone
        @changed="refresh"
      /><h2>{{ t('academic.replies') }}</h2><LoadState
        :busy="replies.busy.value"
        :error="replies.error.value"
        :empty="replies.data.value?.items.length === 0"
        @retry="replies.load"
      /><ReviewCard
        v-for="review in replies.data.value?.items"
        :key="review.id"
        :review="review"
        standalone
        @changed="refresh"
      /><button
        v-if="replies.data.value?.next"
        @click="next"
      >
        {{ t('academic.next') }}
      </button><ReviewEditor
        :key="id"
        kind="reply"
        :target-id="root.data.value.target_id"
        :school-id="root.data.value.school_id"
        :parent-id="id"
        @submitted="refresh"
      />
    </template>
  </section>
</template>
