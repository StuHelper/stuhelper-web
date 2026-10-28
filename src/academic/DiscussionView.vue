<script setup lang="ts">
import { computed,nextTick,ref,watch } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { call,lookupObjects,query,type Review,type ReviewPage,type Result } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'
const {t}=useI18n(),route=useRoute(),router=useRouter()
const id=computed(()=>String(route.params.id)),after=ref(''),history=ref<string[]>([]),replyTo=ref<Review>(),editorVersion=ref(0),editor=ref<HTMLElement>(),thread=ref<{targetId:string;schoolId:string}>(),notice=ref('')
const root=useLoad(async signal=>{
  const entry=await call<Review>('reviews','/'+encodeURIComponent(id.value),'View',{signal})
  if(entry.root_id!==entry.id){await router.replace({path:`/reviews/${encodeURIComponent(entry.root_id)}`,query:route.query,hash:`#review-${entry.id}`})}
  return {entry,references:await lookupObjects([entry.target_id,entry.term_id,entry.teacher_id],signal)}
})
const replies=useLoad(async signal=>{
  const page=await call<ReviewPage>('reviews',query({kind:'reply',root_id:id.value,after:after.value,sort:'oldest'}),'Page',{signal})
  return {page,references:await lookupObjects(page.items.flatMap(row=>[row.target_id,row.term_id,row.teacher_id]),signal)}
})
function refresh(){void root.load();void replies.load()}
watch(id,()=>{after.value='';history.value=[];replyTo.value=undefined;thread.value=undefined;notice.value='';refresh()},{immediate:true})
watch(()=>root.data.value?.entry,entry=>{if(entry)thread.value={targetId:entry.target_id,schoolId:entry.school_id}})
function next(){history.value.push(after.value);after.value=replies.data.value?.page.next??'';void replies.load()}
function previous(){after.value=history.value.pop()??'';void replies.load()}
async function selectReply(review:Review){replyTo.value=review;await nextTick();editor.value?.scrollIntoView({behavior:'smooth',block:'start'});editor.value?.querySelector('textarea')?.focus({preventScroll:true})}
function submitted(result:Result){notice.value=result.state==='pending'?'pending':'published';editorVersion.value++;replyTo.value=undefined;after.value='';history.value=[];refresh()}
function cancel(){replyTo.value=undefined;editorVersion.value++}
const replyName=computed(()=>replyTo.value?.author.anonymous?t('academic.anonymous'):replyTo.value?.author.profile?.name??t('academic.unknown'))
</script>
<template>
  <section class="academic-page">
    <h1>{{ t('academic.discussion') }}</h1><LoadState
      :busy="root.busy.value"
      :error="root.error.value"
      @retry="refresh"
    />
    <template v-if="root.data.value">
      <ReviewCard
        :review="root.data.value.entry"
        :references="root.data.value.references"
        standalone
        reply-enabled
        @reply="selectReply"
        @changed="refresh"
      />
      <h2>{{ t('academic.replies') }}</h2><LoadState
        :busy="replies.busy.value"
        :error="replies.error.value"
        :empty="replies.data.value?.page.items.length===0"
        @retry="replies.load"
      />
      <ReviewCard
        v-for="review in replies.data.value?.page.items"
        :key="review.id"
        :review="review"
        :references="replies.data.value?.references"
        standalone
        reply-enabled
        @reply="selectReply"
        @changed="refresh"
      />
      <div class="academic-actions">
        <button
          v-if="history.length"
          @click="previous"
        >
          {{ t('academic.previous') }}
        </button><button
          v-if="replies.data.value?.page.next"
          @click="next"
        >
          {{ t('academic.next') }}
        </button>
      </div>
    </template>
    <div
      v-if="thread"
      ref="editor"
    >
      <p
        v-if="notice"
        role="status"
      >
        {{ t(`academic.${notice}`) }}
      </p><div
        v-if="replyTo"
        class="academic-card"
      >
        <p>{{ t('academic.replyTo',{name:replyName}) }}</p><blockquote>{{ replyTo.body.slice(0,180) }}</blockquote><button @click="replyTo=undefined">
          {{ t('academic.cancelReply') }}
        </button>
      </div><ReviewEditor
        :key="`${id}-${editorVersion}`"
        kind="reply"
        :blocked="!root.data.value"
        :target-id="thread.targetId"
        :school-id="thread.schoolId"
        :parent-id="replyTo?.id??id"
        @submitted="submitted"
        @cancel="cancel"
      />
    </div>
  </section>
</template>
