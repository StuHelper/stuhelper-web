<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AcademicError, call, Mutation, objectOptions, query, type Draft, type Enrollment, type Result, type ReviewInput } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
const props = defineProps<{ kind: 'course' | 'mentor' | 'reply'; targetId: string; schoolId: string; parentId?: string; draft?: Draft }>()
const emit = defineEmits<{ submitted: [result: Result] }>()
const { t } = useI18n()
const original = props.draft?.input
const title = ref(original?.title ?? ''), body = ref(original?.body ?? (props.kind === 'mentor' ? t('academic.mentorTemplate') : ''))
const term = ref(original?.term_id ?? ''), teacher = ref(original?.teacher_id ?? ''), signed = ref(original?.signed ?? false)
const ratings = ref(original?.ratings.slice() ?? [0, 0, 0, 0, 0])
const draftId = ref(props.draft?.id ?? ''), revision = ref(props.draft?.revision ?? 0)
const busy = ref(false), uncertain = ref(false), error = ref(''), notice = ref('')
const mutation = new Mutation()
const names = ['recommendation', 'quality', 'difficulty', 'workload', 'grading'] as const
const context = useLoad(async signal => {
  const enrollments: Enrollment[] = []
  let after = ''
  for (let page = 0; page < 10; page++) {
    const rows = await call<Enrollment[]>('catalog', '/me/enrollments' + query({ course_id: props.targetId, limit:'100', after }), 'Enrollment', { signal, array:true })
    enrollments.push(...rows)
    if (rows.length < 100) break
    after = rows.at(-1)?.id ?? ''
    if (page === 9) throw new AcademicError('unavailable')
  }
  const [terms, teachers] = await Promise.all([objectOptions({kind:'term',school_id:props.schoolId},signal),objectOptions({kind:'teacher',course_id:props.targetId},signal)])
  if (!term.value && new Set(enrollments.map(item => item.term_id)).size === 1) term.value = enrollments[0]?.term_id ?? ''
  return {enrollments,terms,teachers}
})
if (props.kind === 'course') void context.load()
const ownTeachers = computed(() => new Set(context.data.value?.enrollments.filter(item => item.term_id === term.value).flatMap(item => item.teacher_ids) ?? []))
watch(term, () => { if (!props.draft?.withdrawn) teacher.value = '' })
function input(): ReviewInput { return {kind:props.kind,target_id:props.targetId,title:title.value,body:body.value,ratings:ratings.value,signed:signed.value,...(props.kind === 'course' ? {term_id:term.value,teacher_id:teacher.value} : {})} }
async function submit(saveDraft = false) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    let path = '', payload: unknown = input()
    if (saveDraft && !props.draft?.withdrawn) { path = '/me/drafts'; payload = {id:draftId.value,revision:revision.value,input:input()} }
    else if (props.draft?.withdrawn) { path = `/${props.draft.id}/actions`; payload = {action:'republish',revision:revision.value,input:input()} }
    else if (props.parentId) path = `/${props.parentId}/replies`
    const result = await mutation.run<Result>('reviews',path,'Result',payload)
    if (result.state === 'draft') { draftId.value = result.id; revision.value = result.revision; notice.value = 'draftSaved' }
    else { notice.value = result.state === 'pending' ? 'pending' : 'published'; emit('submitted',result) }
  } catch (failure) { error.value = failure instanceof AcademicError ? failure.code : 'unavailable' }
  finally { busy.value = false; uncertain.value = mutation.uncertain }
}
</script>
<template>
  <form
    class="academic-editor"
    @submit.prevent="submit()"
  >
    <h2>{{ t(kind === 'mentor' ? 'academic.writeMentor' : kind === 'reply' ? 'academic.reply' : 'academic.writeReview') }}</h2>
    <p>{{ t('academic.identityHint') }}</p>
    <LoadState
      v-if="kind === 'course'"
      :busy="context.busy.value"
      :error="context.error.value"
      @retry="context.load"
    />
    <fieldset :disabled="busy || uncertain">
      <template v-if="kind === 'course'">
        <label>{{ t('academic.reviewTerm') }}<select
          v-model="term"
          required
          :disabled="draft?.withdrawn"
        ><option value="">{{ t('academic.choose') }}</option><option
          v-for="item in context.data.value?.terms.items"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option></select></label>
        <label>{{ t('academic.taughtBy') }}<select
          v-model="teacher"
          :disabled="draft?.withdrawn"
        ><option value="">{{ t('academic.noTeacher') }}</option><option
          v-for="item in context.data.value?.teachers.items.filter(item => ownTeachers.has(item.id))"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option></select></label>
        <p>{{ t('academic.termHint') }}</p>
        <div class="academic-ratings-input">
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
      <label v-if="kind !== 'reply'">{{ t('academic.title') }}<input
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
      <label class="academic-checkbox"><input
        v-model="signed"
        :disabled="draft?.withdrawn"
        type="checkbox"
      >{{ t('academic.signed') }}</label>
    </fieldset>
    <p
      v-if="error"
      role="alert"
    >
      {{ t(`academic.errors.${error}`) }}
    </p>
    <p
      v-if="uncertain"
      role="status"
    >
      {{ t('academic.uncertain') }}
    </p>
    <p
      v-if="notice"
      role="status"
    >
      {{ t(`academic.${notice}`) }}
    </p>
    <div class="academic-actions">
      <button
        type="submit"
        :disabled="busy"
      >
        {{ t(uncertain ? 'academic.retry' : 'academic.publish') }}
      </button><button
        v-if="!parentId && !draft?.withdrawn && !uncertain"
        type="button"
        :disabled="busy"
        @click="submit(true)"
      >
        {{ t('academic.saveDraft') }}
      </button>
    </div>
  </form>
</template>
