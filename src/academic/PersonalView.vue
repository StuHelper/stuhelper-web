<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { RouterLink,useRoute,useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AcademicError,call,Mutation,lookupObjects,query,type AcademicObject,type Submission,type Draft,type ReviewPage,type Review,type Task } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'
const route=useRoute(),router=useRouter(),{t,d}=useI18n()
const tabs=['entries','drafts','bookmarks','votes','reports'] as const
const tab=computed(()=>tabs.find(value=>value===route.query.tab)??'entries')
const after=ref(''),next=ref(''),history=ref<string[]>([]),editing=ref<Draft>(),error=ref(''),busy=ref(false),uncertain=ref(false)
const mutation=new Mutation()
const appealTask=ref<Task>(),appealReason=ref(''),appealBusy=ref(false),appealUncertain=ref(false),appealError=ref('')
const appealMutation=new Mutation()
async function appeal(){if(!appealTask.value||appealBusy.value)return;appealBusy.value=true;appealError.value='';try{await appealMutation.run('moderation','/tasks','TaskView',{object_id:appealTask.value.submission.object_id,previous_task_id:appealTask.value.id,kind:'appeal',reason:appealReason.value,evidence:[]} satisfies Submission);appealTask.value=undefined;appealReason.value='';await data.load()}catch(e){appealError.value=e instanceof AcademicError?e.code:'unavailable'}finally{appealBusy.value=false;appealUncertain.value=appealMutation.uncertain}}

type PersonalData={entries?:Review[];drafts?:Draft[];bookmarks?:{id:string;target?:AcademicObject}[];reports?:Task[];references:Map<string,AcademicObject>}
const data=useLoad<PersonalData>(async signal=>{
  const suffix=query({after:after.value,limit:'20',...(tab.value==='entries'?{sort:'newest'}:{})})
  let rows:PersonalData,cursor=''
  if(tab.value==='entries'){const page=await call<ReviewPage>('reviews','/me/entries'+suffix,'Page',{signal});cursor=page.next;rows={entries:page.items,references:await lookupObjects(page.items.flatMap(row=>[row.target_id,row.term_id,row.teacher_id]),signal)}}
  else if(tab.value==='votes'){const entries=await call<Review[]>('reviews','/me/votes'+suffix,'View',{signal,array:true});if(entries.length===20)cursor=entries.at(-1)?.id??'';rows={entries,references:await lookupObjects(entries.flatMap(row=>[row.target_id,row.term_id,row.teacher_id]),signal)}}
  else if(tab.value==='drafts'){const drafts=await call<Draft[]>('reviews','/me/drafts'+suffix,'DraftView',{signal,array:true});if(drafts.length===20)cursor=drafts.at(-1)?.id??'';rows={drafts,references:await lookupObjects(drafts.map(row=>row.input.target_id),signal)}}
  else if(tab.value==='bookmarks'){const ids=await call<string[]>('reviews','/me/bookmarks'+suffix,'string',{signal,array:true});if(ids.length===20)cursor=ids.at(-1)??'';const references=await lookupObjects(ids,signal);rows={bookmarks:ids.map(id=>({id,target:references.get(id)})),references}}
  else {const reports=await call<Task[]>('moderation','/tasks'+suffix,'TaskView',{signal,array:true});if(reports.length===20)cursor=reports.at(-1)?.id??'';rows={reports,references:new Map()}}
  if(!signal.aborted)next.value=cursor
  return rows
})
watch(tab,()=>{after.value='';next.value='';history.value=[];editing.value=undefined;void data.load()},{immediate:true})
const empty=computed(()=>!!data.data.value&&(data.data.value.entries??data.data.value.drafts??data.data.value.bookmarks??data.data.value.reports??[]).length===0)
const selected=computed(()=>editing.value?data.data.value?.references.get(editing.value.input.target_id):undefined)
async function remove(kind:string,id:string,revision=0){
  if(busy.value)return
  if(kind==='draft'&&!window.confirm(t('academic.deleteDraftConfirm')))return
  busy.value=true;error.value=''
  try{if(kind==='draft')await mutation.run('reviews',`/me/drafts/${encodeURIComponent(id)}`,'Result',{revision},'DELETE');else await mutation.run('reviews','/me/bookmarks','Result',{target_id:id,set:false});await data.load()}
  catch(failure){error.value=failure instanceof AcademicError?failure.code:'unavailable'}
  finally{busy.value=false;uncertain.value=mutation.uncertain}
}
async function edit(draft:Draft){
  busy.value=true;error.value=''
  try{editing.value=await call<Draft>('reviews',`/me/drafts/${encodeURIComponent(draft.id)}`,'DraftView')}
  catch(failure){error.value=failure instanceof AcademicError?failure.code:'unavailable'}
  finally{busy.value=false}
}
function closeEditor(){editing.value=undefined;void data.load()}
function advance(){history.value.push(after.value);after.value=next.value;next.value='';void data.load()}
function previous(){after.value=history.value.pop()??'';next.value='';void data.load()}
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
        @click="router.replace({query:{...route.query,tab:item}})"
      >
        {{ t(`academic.tabs.${item}`) }}
      </button>
    </nav>
    <LoadState
      :busy="data.busy.value"
      :error="data.error.value"
      :empty="empty"
      @retry="data.load"
    /><p
      v-if="error"
      role="alert"
    >
      {{ t(`academic.errors.${error}`) }}
    </p>
    <div v-if="uncertain">
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
      :references="data.data.value?.references"
      @changed="data.load"
    />
    <template v-if="!editing">
      <article
        v-for="draft in data.data.value?.drafts"
        :key="draft.id"
        class="academic-card"
      >
        <h2>{{ data.data.value?.references.get(draft.input.target_id)?.name??t('academic.unknown') }}</h2><p>{{ draft.input.title }}</p><p v-if="draft.expires_at">
          {{ t('academic.expires',{date:d(new Date(draft.expires_at),'dateTime')}) }}
        </p><details>
          <summary>{{ t('academic.viewDetails') }}</summary><p class="review-body">
            {{ draft.input.body }}
          </p>
        </details><div class="academic-actions">
          <button
            :disabled="busy||uncertain||!data.data.value?.references.has(draft.input.target_id)"
            @click="edit(draft)"
          >
            {{ t('academic.editDraft') }}
          </button><button
            v-if="!draft.withdrawn"
            :disabled="busy||uncertain"
            @click="remove('draft',draft.id,draft.revision)"
          >
            {{ t('academic.deleteDraft') }}
          </button>
        </div>
      </article>
    </template>
    <ReviewEditor
      v-if="selected&&editing"
      :key="editing.id"
      :draft="editing"
      :kind="editing.input.kind"
      :target-id="selected.id"
      :school-id="selected.school_id"
      :parent-id="editing.input.kind==='reply'?editing.root_id:undefined"
      @submitted="closeEditor"
      @cancel="closeEditor"
    />
    <article
      v-for="item in data.data.value?.bookmarks"
      :key="item.id"
      class="academic-card"
    >
      <h2>
        <RouterLink
          v-if="item.target"
          :to="`/courses/${encodeURIComponent(item.id)}`"
        >
          {{ item.target.name }}
        </RouterLink><span v-else>{{ t('academic.errors.not_found') }}</span>
      </h2><button
        :disabled="busy||uncertain"
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
      <h2>{{ t(`academic.requestKinds.${task.submission.kind}`) }}</h2><p v-if="task.submission.reason!=='content_review'">
        {{ task.submission.reason }}
      </p><p>{{ t(`academic.taskStates.${task.state}`) }}</p><p>{{ d(new Date(task.updated_at),'dateTime') }}</p><p v-if="task.decision">
        {{ task.decision.reason }}
      </p><RouterLink :to="`/reviews/${encodeURIComponent(task.submission.object_id)}`">
        {{ t('academic.viewDetails') }}
      </RouterLink><button
        v-if="task.can_appeal"
        :disabled="appealBusy||appealUncertain"
        @click="appealTask=task;appealReason='';appealError=''"
      >
        {{ t('academic.appeal') }}
      </button>
    </article>
    <form
      v-if="appealTask"
      class="academic-editor"
      @submit.prevent="appeal"
    >
      <h2>{{ t('academic.appeal') }}</h2><label>{{ t('academic.reason') }}<textarea
        v-model="appealReason"
        required
        maxlength="2000"
        :disabled="appealBusy||appealUncertain"
      /></label><p
        v-if="appealError"
        role="alert"
      >
        {{ t(`academic.errors.${appealError}`) }}
      </p><p v-if="appealUncertain">
        {{ t('academic.uncertain') }}
      </p><button :disabled="appealBusy">
        {{ t(appealUncertain?'academic.retry':'academic.confirm') }}
      </button><button
        type="button"
        :disabled="appealBusy||appealUncertain"
        @click="appealTask=undefined"
      >
        {{ t('academic.cancel') }}
      </button>
    </form>
    <div
      v-if="!editing"
      class="academic-actions"
    >
      <button
        v-if="history.length"
        :disabled="data.busy.value"
        @click="previous"
      >
        {{ t('academic.previous') }}
      </button><button
        v-if="next"
        :disabled="data.busy.value"
        @click="advance"
      >
        {{ t('academic.next') }}
      </button>
    </div>
  </section>
</template>
