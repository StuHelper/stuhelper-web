<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,onMounted,ref,watch } from 'vue'
import { onBeforeRouteLeave,onBeforeRouteUpdate } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AcademicError,call,lookupObjects,Mutation,objectOptions,query,type Composer,type Draft,type Result,type ReviewInput } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
const props=defineProps<{kind:'course'|'mentor'|'reply';targetId:string;schoolId:string;parentId?:string;draft?:Draft;blocked?:boolean}>()
const emit=defineEmits<{submitted:[result:Result];cancel:[]}>()
const {t}=useI18n()
const original=props.draft?.input
const title=ref(original?.title??''),body=ref(original?.body??(props.kind==='mentor'?t('academic.mentorTemplate'):''))
const term=ref(original?.term_id??''),teacher=ref(original?.teacher_id??''),signed=ref(original?.signed??false)
const ratings=ref(original?.ratings.slice()??[0,0,0,0,0]),draftId=ref(props.draft?.id??''),revision=ref(props.draft?.revision??0)
const busy=ref(false),uncertain=ref(false),error=ref(''),notice=ref(''),lastIntent=ref(false),latest=ref<Draft>(),latestError=ref(''),latestBusy=ref(false)
const expires=ref(props.draft?.expires_at),clock=ref(Date.now())
const mutation=new Mutation(),names=['recommendation','quality','difficulty','workload','grading'] as const
const terms=useLoad(signal=>objectOptions({kind:'term',school_id:props.schoolId},signal))
if(props.kind==='course')void terms.load()
const context=useLoad(async signal=>{
  const composer=await call<Composer>('reviews','/compose'+query({kind:props.kind,target_id:props.targetId,term_id:props.kind==='course'?term.value:undefined,parent_id:props.kind==='reply'?props.parentId:undefined}),'Composer',{signal})
  const references=await lookupObjects([...composer.teacher_ids,original?.teacher_id,original?.term_id],signal)
  return {composer,references}
})
const identityMode=computed(()=>props.draft?.withdrawn?(signed.value?'signed':'anonymous'):context.data.value?.composer.identity??'choice')
let restoring=false
watch(term,()=>{if(!props.draft?.withdrawn&&!restoring)teacher.value=''})
watch(()=>[props.kind,props.targetId,props.parentId,term.value],()=>{void context.load()},{immediate:true})
watch(()=>context.data.value?.composer.identity,mode=>{if(!props.draft?.withdrawn&&mode&&mode!=='choice')signed.value=mode==='signed'})
function input():ReviewInput{return {kind:props.kind,target_id:props.targetId,title:title.value,body:body.value,ratings:ratings.value.slice(),signed:signed.value,...(props.kind==='course'?{term_id:term.value,teacher_id:teacher.value}:{})}}
const baseline=ref(JSON.stringify(input())),dirty=computed(()=>JSON.stringify(input())!==baseline.value)
const remaining=computed(()=>{if(!expires.value)return '';const minutes=Math.max(0,Math.ceil((new Date(expires.value).getTime()-clock.value)/60000));return `${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`})
function confirmLeave(){return !(dirty.value||busy.value||uncertain.value)||window.confirm(t(uncertain.value?'academic.uncertain':'academic.unsavedChanges'))}
onBeforeRouteLeave(confirmLeave);onBeforeRouteUpdate(confirmLeave)
function beforeUnload(event:BeforeUnloadEvent){if(dirty.value||busy.value||uncertain.value)event.preventDefault()}
let interval:ReturnType<typeof setInterval>|undefined
onMounted(()=>{window.addEventListener('beforeunload',beforeUnload);interval=setInterval(()=>{clock.value=Date.now()},30000)})
onBeforeUnmount(()=>{window.removeEventListener('beforeunload',beforeUnload);clearInterval(interval)})
function cancel(){if(confirmLeave())emit('cancel')}
async function submit(saveDraft=false){
  if(busy.value)return
  const saving=uncertain.value?lastIntent.value:saveDraft
  if(!uncertain.value)lastIntent.value=saveDraft
  busy.value=true;error.value='';notice.value=''
  try{
    let path='',payload:unknown=input()
    if(props.draft?.withdrawn){path=`/${encodeURIComponent(props.draft.id)}/actions`;payload={action:saving?'save_withdrawn':'republish',revision:revision.value,input:input()}}
    else if(saving){path='/me/drafts';payload={id:draftId.value,revision:revision.value,input:input()}}
    else if(draftId.value){path=`/me/drafts/${encodeURIComponent(draftId.value)}/publish`;payload={revision:revision.value,input:input()}}
    else if(props.parentId)path=`/${encodeURIComponent(props.parentId)}/replies`
    const result=await mutation.run<Result>('reviews',path,'Result',payload)
    baseline.value=JSON.stringify(input());latest.value=undefined
    if(result.state==='draft'||saving&&result.state==='withdrawn'){draftId.value=result.id;revision.value=result.revision;expires.value=result.expires_at;notice.value='draftSaved'}
    else {notice.value=result.state==='pending'?'pending':'published';emit('submitted',result)}
  }catch(failure){error.value=failure instanceof AcademicError?failure.code:'unavailable'}
  finally{busy.value=false;uncertain.value=mutation.uncertain}
}
async function loadLatest(){
  if(!draftId.value||latestBusy.value)return
  latestBusy.value=true;latestError.value=''
  try{latest.value=await call<Draft>('reviews',`/me/drafts/${encodeURIComponent(draftId.value)}`,'DraftView')}
  catch(failure){latestError.value=failure instanceof AcademicError?failure.code:'unavailable'}
  finally{latestBusy.value=false}
}
async function useLatest(){
  const data=latest.value;if(!data)return
  restoring=true;title.value=data.input.title;body.value=data.input.body;term.value=data.input.term_id??'';teacher.value=data.input.teacher_id??'';signed.value=data.input.signed;ratings.value=data.input.ratings.slice();revision.value=data.revision;expires.value=data.expires_at
  baseline.value=JSON.stringify(input());error.value='';latest.value=undefined;await nextTick();restoring=false
}
function keepMine(){if(!latest.value)return;revision.value=latest.value.revision;expires.value=latest.value.expires_at;error.value='';latest.value=undefined}
</script>
<template>
  <form
    class="academic-editor"
    @submit.prevent="submit()"
  >
    <h2>{{ t(kind==='mentor'?'academic.writeMentor':kind==='reply'?'academic.reply':'academic.writeReview') }}</h2><p>{{ t('academic.identityHint') }}</p>
    <LoadState
      v-if="kind==='course'"
      :busy="terms.busy.value"
      :error="terms.error.value"
      @retry="terms.load"
    />
    <LoadState
      :busy="context.busy.value"
      :error="context.error.value"
      @retry="context.load"
    />
    <section
      v-if="context.data.value"
      class="eligibility-panel"
      :aria-label="t('academic.eligibility')"
    >
      <h3>{{ t('academic.eligibility') }}</h3><ul>
        <li
          v-for="requirement in context.data.value.composer.requirements"
          :key="requirement.key"
        >
          <span>{{ t(`academic.requirements.${requirement.key}`) }}</span><strong :class="`requirement-${requirement.state}`">{{ t(`academic.requirementStates.${requirement.state}`) }}</strong>
        </li>
      </ul>
      <p v-if="context.data.value.composer.state==='choose_term'">
        {{ t('academic.chooseReviewTerm') }}
      </p><p v-else-if="context.data.value.composer.state==='enrollment_required'">
        {{ t('academic.noEnrollmentHint') }}
      </p><p v-else-if="context.data.value.composer.allowed">
        {{ t('academic.readyToPublish') }}
      </p><p v-else>
        {{ t(`academic.errors.${context.data.value.composer.state}`) }}
      </p>
      <button
        type="button"
        :disabled="context.busy.value"
        @click="context.load"
      >
        {{ t('academic.refreshEligibility') }}
      </button>
    </section>
    <p
      v-if="expires"
      role="status"
    >
      {{ t('academic.draftRemaining',{value:remaining}) }}
    </p>
    <fieldset :disabled="busy||uncertain">
      <template v-if="kind==='course'">
        <label>{{ t('academic.reviewTerm') }}<select
          v-model="term"
          required
          :disabled="draft?.withdrawn"
        ><option value="">{{ t('academic.choose') }}</option><option
          v-for="item in terms.data.value?.items"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option></select></label>
        <label>{{ t('academic.taughtBy') }}<select
          v-model="teacher"
          :disabled="draft?.withdrawn||!term"
        ><option value="">{{ t('academic.noTeacher') }}</option><option
          v-for="teacherId in context.data.value?.composer.teacher_ids"
          :key="teacherId"
          :value="teacherId"
        >{{ context.data.value?.references.get(teacherId)?.name??t('academic.unknown') }}</option><option
          v-if="draft?.withdrawn && teacher && !context.data.value?.composer.teacher_ids.includes(teacher)"
          :value="teacher"
        >{{ context.data.value?.references.get(teacher)?.name??t('academic.unknown') }}</option></select></label>
        <p>{{ t('academic.termHint') }}</p><div class="academic-ratings-input">
          <label
            v-for="(name,index) in names"
            :key="name"
          >{{ t(`academic.ratings.${name}.label`) }}<select
            v-model.number="ratings[index]"
            required
          ><option
            :value="0"
            disabled
          >{{ t('academic.choose') }}</option><option
            v-for="level in 5"
            :key="level"
            :value="level"
          >{{ t(`academic.ratings.${name}.level${level}`) }}</option></select></label>
        </div>
      </template>
      <label v-if="kind!=='reply'">{{ t('academic.title') }}<input
        v-model="title"
        maxlength="200"
        required
      ></label>
      <label>{{ t('academic.body') }}<textarea
        v-model="body"
        rows="10"
        maxlength="16000"
        required
      /></label>
      <label
        v-if="identityMode==='choice'"
        class="academic-checkbox"
      ><input
        v-model="signed"
        type="checkbox"
      >{{ t('academic.signed') }}</label><p v-else>
        {{ t(identityMode==='signed'?'academic.identityFixedSigned':'academic.identityFixedAnonymous') }}
      </p>
    </fieldset>
    <p
      v-if="error"
      role="alert"
    >
      {{ t(`academic.errors.${error}`) }}
    </p><p
      v-if="uncertain"
      role="status"
    >
      {{ t('academic.uncertain') }}
    </p><p
      v-if="notice"
      role="status"
    >
      {{ t(`academic.${notice}`) }}
    </p>
    <section
      v-if="error==='conflict' && draftId"
      class="draft-conflict"
    >
      <h3>{{ t('academic.draftConflict') }}</h3><button
        type="button"
        :disabled="latestBusy"
        @click="loadLatest"
      >
        {{ t('academic.loadLatestDraft') }}
      </button><p
        v-if="latestError"
        role="alert"
      >
        {{ t('academic.savedDraftUnavailable') }}
      </p><template v-if="latest">
        <h4>{{ t('academic.latestDraft') }}</h4><p>{{ latest.input.title }}</p><p class="review-body">
          {{ latest.input.body }}
        </p><div class="academic-actions">
          <button
            type="button"
            @click="useLatest"
          >
            {{ t('academic.useLatestDraft') }}
          </button><button
            type="button"
            @click="keepMine"
          >
            {{ t('academic.keepMyDraft') }}
          </button>
        </div>
      </template>
    </section>
    <div class="academic-actions">
      <button
        type="submit"
        :disabled="busy||(!uncertain&&(blocked||!context.data.value?.composer.allowed))"
      >
        {{ t(uncertain?'academic.retry':'academic.publish') }}
      </button><button
        v-if="(kind!=='reply'||draft?.withdrawn)&&!uncertain"
        type="button"
        :disabled="busy"
        @click="submit(true)"
      >
        {{ t('academic.saveDraft') }}
      </button><button
        type="button"
        :disabled="busy"
        @click="cancel"
      >
        {{ t('academic.cancel') }}
      </button>
    </div>
  </form>
</template>
