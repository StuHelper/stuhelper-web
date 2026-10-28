<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { AcademicError, Mutation, lookupObjects, type AcademicObject, type Result, type Review } from './api'
import { useLoad } from './useLoad'
import RatingBands from './RatingBands.vue'
const props = defineProps<{ review: Review; standalone?: boolean; references?:Map<string,AcademicObject>; replyEnabled?:boolean }>()
const emit = defineEmits<{ changed: []; reply:[review:Review] }>()
const { t, n, d } = useI18n(), router = useRouter()
const error = ref(''), busy = ref(false), uncertain = ref(false), notice = ref(''), panel = ref(''), reason = ref(''), proposed = ref('')
const mutation = new Mutation()
const metadata=useLoad(signal=>lookupObjects([props.review.target_id,props.review.term_id,props.review.teacher_id],signal))
watch(()=>[props.review.id,props.references],()=>{if(!props.references)void metadata.load()},{immediate:true})
const references=computed(()=>props.references??metadata.data.value)
const target=computed(()=>references.value?.get(props.review.target_id))
const author=computed(()=>props.review.author.anonymous?(props.review.author.handle==='author'?t('academic.anonymous'):t('academic.anonymousHandle',{handle:props.review.author.handle.slice(0,6)})):props.review.author.profile?.name??t('academic.unknown'))
const avatar=computed(()=>{const value=props.review.author.profile?.avatar;if(!value)return '';try{const url=new URL(value,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}})
async function action(action: string, vote = 0) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    let result: Result | undefined
    if (['report','edit_request','delete_request'].includes(action)) { await mutation.run('moderation','/tasks','TaskView',{object_id:props.review.id,kind:action,reason:reason.value,evidence:[],...(action==='edit_request'?{proposed_body:proposed.value}:{})}); notice.value = action==='report'?'reportSent':'requestSent' }
    else result = await mutation.run<Result>('reviews',`/${props.review.id}/actions`,'Result',{action,revision:props.review.revision,...(action === 'vote' ? {vote} : {})})
    panel.value = ''; reason.value = ''; emit('changed')
    if (result?.state === 'withdrawn') await router.push('/community/me?tab=drafts')
  } catch (failure) { error.value = failure instanceof AcademicError ? failure.code : 'unavailable' }
  finally { busy.value = false; uncertain.value = mutation.uncertain }
}
</script>
<template>
  <article
    :id="`review-${review.id}`"
    class="academic-card review-card"
  >
    <header>
      <p
        v-if="target"
        class="review-context"
      >
        <RouterLink :to="`/${target.kind==='teacher'?'teachers':'courses'}/${encodeURIComponent(target.id)}`">
          {{ target.name }}
        </RouterLink><span v-if="review.kind==='course'">{{ review.teacher_id?references?.get(review.teacher_id)?.name??t('academic.unknown'):t('academic.noTeacher') }}</span>
      </p>
      <p class="review-meta">
        <img
          v-if="avatar"
          :src="avatar"
          alt=""
          width="28"
          height="28"
          class="review-avatar"
          loading="lazy"
          referrerpolicy="no-referrer"
        >
        <span>{{ author }}</span><span v-if="review.parent_id && review.author.handle==='author'">{{ t('academic.author') }}</span><span v-if="review.published_at">{{ d(new Date(review.published_at),'dateTime') }}</span><span v-if="review.term_id">{{ references?.get(review.term_id)?.name ?? t('academic.reviewTerm') }}</span><span v-if="review.mine">{{ t(`academic.states.${review.state}`) }}</span>
      </p><h3 v-if="review.title">
        <span v-if="standalone">{{ review.title }}</span><RouterLink
          v-else
          :to="review.mine&&review.state!=='published'?`/community/me/entries/${encodeURIComponent(review.id)}`:`/reviews/${encodeURIComponent(review.root_id)}`"
        >
          {{ review.title }}
        </RouterLink>
      </h3>
    </header>
    <p class="review-body">
      {{ review.body }}
    </p>
    <RatingBands
      v-if="review.kind === 'course' && !review.preview"
      :dimensions="review.ratings.map(level => ({ level, samples:1, courses:1 }))"
      :show-samples="false"
    />
    <p
      v-if="review.preview"
      class="academic-muted"
    >
      {{ t('academic.previewHint') }}
    </p>
    <div class="academic-actions">
      <button
        v-if="review.state==='published'"
        :disabled="busy || uncertain"
        :aria-pressed="review.my_vote === 1"
        @click="action('vote',review.my_vote === 1 ? 0 : 1)"
      >
        {{ t('academic.upvote') }} {{ n(review.upvotes) }}
      </button><button
        v-if="review.state==='published'"
        :disabled="busy || uncertain"
        :aria-pressed="review.my_vote === -1"
        @click="action('vote',review.my_vote === -1 ? 0 : -1)"
      >
        {{ t('academic.downvote') }} {{ n(review.downvotes) }}
      </button><RouterLink
        v-if="!standalone"
        :to="review.mine&&review.state!=='published'?`/community/me/entries/${encodeURIComponent(review.id)}`:`/reviews/${encodeURIComponent(review.root_id)}`"
      >
        {{ t(review.mine&&review.state!=='published'?'academic.viewOwnEntry':'academic.discussion') }}
      </RouterLink><button
        v-if="review.state==='published'"
        :disabled="busy || uncertain"
        @click="panel = panel === 'report' ? '' : 'report'"
      >
        {{ t('academic.report') }}
      </button><button
        v-if="replyEnabled && review.state==='published'"
        :disabled="busy || uncertain"
        @click="emit('reply',review)"
      >
        {{ t('academic.reply') }}
      </button><button
        v-if="review.can_edit"
        :disabled="busy || uncertain"
        @click="panel = 'withdraw'"
      >
        {{ t('academic.withdraw') }}
      </button><button
        v-if="review.can_edit"
        :disabled="busy || uncertain"
        @click="panel = 'delete'"
      >
        {{ t('academic.delete') }}
      </button>
      <button
        v-if="review.mine && !review.can_edit && review.state!=='deleted'"
        :disabled="busy || uncertain"
        @click="panel='edit_request';proposed=review.body"
      >
        {{ t('academic.requestEdit') }}
      </button>
      <button
        v-if="review.mine && !review.can_edit && review.state!=='deleted'"
        :disabled="busy || uncertain"
        @click="panel='delete_request'"
      >
        {{ t('academic.requestDelete') }}
      </button>
    </div>
    <form
      v-if="panel"
      class="academic-action-panel"
      @submit.prevent="action(panel)"
    >
      <template v-if="['report','edit_request','delete_request'].includes(panel)">
        <label>{{ t('academic.reason') }}<textarea
          v-model="reason"
          rows="3"
          maxlength="2000"
          required
          :disabled="busy || uncertain"
        /></label>
        <label v-if="panel==='edit_request'">{{ t('academic.proposedBody') }}<textarea
          v-model="proposed"
          rows="8"
          maxlength="16000"
          required
          :disabled="busy || uncertain"
        /></label>
      </template><p v-else>
        {{ t(panel === 'delete' ? 'academic.deleteConfirm' : 'academic.withdrawConfirm') }}
      </p><div class="academic-actions">
        <button
          type="submit"
          :disabled="busy || uncertain"
        >
          {{ t('academic.confirm') }}
        </button><button
          type="button"
          :disabled="busy || uncertain"
          @click="panel = ''"
        >
          {{ t('academic.cancel') }}
        </button>
      </div>
    </form>
    <p
      v-if="error"
      role="alert"
    >
      {{ t(`academic.errors.${error}`) }}
    </p><div v-if="uncertain">
      <p>{{ t('academic.uncertain') }}</p><button
        :disabled="busy"
        @click="action('retry')"
      >
        {{ t('academic.retry') }}
      </button>
    </div><p
      v-if="notice"
      role="status"
    >
      {{ t(`academic.${notice}`) }}
    </p>
  </article>
</template>
