<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AcademicError, call, Mutation, object, query, type Draft, type ReviewPage, type Review, type Task } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'
const route=useRoute(), router=useRouter(), {t,d}=useI18n()
const tabs=['entries','drafts','bookmarks','votes','reports'] as const
const tab=computed(()=>tabs.find(value=>value===route.query.tab) ?? 'entries')
const after=ref(''), next=ref(''), editing=ref<Draft>(), error=ref(''), busy=ref(false), uncertain=ref(false)
const mutation=new Mutation()
const data=useLoad(async signal=>{
  next.value='';editing.value=undefined
  const suffix=query({after:after.value,limit:'20'})
  if(tab.value==='entries'){const page=await call<ReviewPage>('reviews','/me/entries'+suffix,'Page',{signal});next.value=page.next;return {entries:page.items}}
  if(tab.value==='votes'){const rows=await call<Review[]>('reviews','/me/votes'+suffix,'View',{signal,array:true});if(rows.length===20)next.value=rows.at(-1)?.id ?? '';return {entries:rows}}
  if(tab.value==='drafts'){const rows=await call<Draft[]>('reviews','/me/drafts'+suffix,'DraftView',{signal,array:true});if(rows.length===20)next.value=rows.at(-1)?.id ?? '';return {drafts:await Promise.all(rows.map(async draft=>({draft,target:await object(draft.input.target_id,signal)})))}}
  if(tab.value==='bookmarks'){const ids=await call<string[]>('reviews','/me/bookmarks'+suffix,'string',{signal,array:true});if(ids.length===20)next.value=ids.at(-1) ?? '';return {bookmarks:await Promise.all(ids.map(id=>object(id,signal)))}}
  const rows=await call<Task[]>('moderation','/tasks'+suffix,'TaskView',{signal,array:true});if(rows.length===20)next.value=rows.at(-1)?.id ?? '';return {reports:rows}
})
watch(tab,()=>{after.value='';void data.load()},{immediate:true})
const empty=computed(()=>!!data.data.value && Object.values(data.data.value).every(items=>items.length===0))
const selected=computed(()=>data.data.value?.drafts?.find(row=>row.draft.id===editing.value?.id))
async function remove(kind:string,id:string,revision=0){
  busy.value=true;error.value=''
  try{
    if(kind==='draft') await mutation.run('reviews',`/me/drafts/${id}`,'Result',{revision},'DELETE')
    else if(kind==='withdrawn') await mutation.run('reviews',`/${id}/actions`,'Result',{action:'delete',revision})
    else await mutation.run('reviews','/me/bookmarks','Result',{target_id:id,set:false})
    await data.load()
  }catch(failure){error.value=failure instanceof AcademicError ? failure.code : 'unavailable'}
  finally{busy.value=false;uncertain.value=mutation.uncertain}
}
function advance(){after.value=next.value;void data.load()}
</script>
<template>
  <section class="academic-page">
    <h1>{{ t('academic.myCommunity') }}</h1><nav
      class="academic-tabs"
      :aria-label="t('academic.myCommunity')"
    >
      <button
        v-for="item in tabs"
        :key="item"
        :aria-pressed="tab===item"
        @click="router.replace({query:{tab:item}})"
      >
        {{ t(`academic.tabs.${item}`) }}
      </button>
    </nav><LoadState
      :busy="data.busy.value"
      :error="data.error.value"
      :empty="empty"
      @retry="data.load"
    /><p
      v-if="error"
      role="alert"
    >
      {{ t(`academic.errors.${error}`) }}
    </p><div v-if="uncertain">
      <p>{{ t('academic.uncertain') }}</p><button
        :disabled="busy"
        @click="remove('retry','')"
      >
        {{ t('academic.retry') }}
      </button>
    </div>
    <ReviewCard
      v-for="review in data.data.value?.entries"
      :key="review.id"
      :review="review"
      @changed="data.load"
    />
    <article
      v-for="item in data.data.value?.drafts"
      :key="item.draft.id"
      class="academic-card"
    >
      <h2>{{ item.target.name }}</h2><p>{{ item.draft.input.title }}</p><p v-if="item.draft.expires_at">
        {{ t('academic.expires',{date:d(new Date(item.draft.expires_at),'dateTime')}) }}
      </p><div class="academic-actions">
        <button @click="editing=item.draft">
          {{ t('academic.editDraft') }}
        </button><button
          v-if="!item.draft.withdrawn"
          :disabled="busy || uncertain"
          @click="remove(item.draft.withdrawn?'withdrawn':'draft',item.draft.id,item.draft.revision)"
        >
          {{ t('academic.deleteDraft') }}
        </button>
      </div>
    </article>
    <ReviewEditor
      v-if="selected && editing"
      :key="editing.id"
      :draft="editing"
      :kind="editing.input.kind"
      :target-id="selected.target.id"
      :school-id="selected.target.school_id"
      @submitted="editing=undefined;data.load()"
    />
    <article
      v-for="item in data.data.value?.bookmarks"
      :key="item.id"
      class="academic-card"
    >
      <h2>
        <RouterLink :to="`/courses/${item.id}`">
          {{ item.name }}
        </RouterLink>
      </h2><button
        :disabled="busy || uncertain"
        @click="remove('bookmark',item.id)"
      >
        {{ t('academic.unbookmark') }}
      </button>
    </article>
    <article
      v-for="task in data.data.value?.reports"
      :key="task.id"
      class="academic-card"
    >
      <p>{{ task.submission.reason }}</p><p>{{ t(`academic.taskStates.${task.state}`) }}</p><p v-if="task.decision">
        {{ task.decision.reason }}
      </p>
    </article>
    <div class="academic-actions">
      <button
        v-if="after"
        @click="after='';data.load()"
      >
        {{ t('academic.first') }}
      </button><button
        v-if="next"
        @click="advance"
      >
        {{ t('academic.next') }}
      </button>
    </div>
  </section>
</template>
