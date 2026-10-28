<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { RouterLink,useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AcademicError,Mutation,objects,summary,type Result } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import ReviewEditor from './ReviewEditor.vue'
import ReviewFeed from './ReviewFeed.vue'
import StatisticsSection from './StatisticsSection.vue'
import OfferingsSection from './OfferingsSection.vue'
const route=useRoute(),{t,n}=useI18n()
const id=computed(()=>String(route.params.id)),kind=computed(()=>route.path.startsWith('/teachers/')?'teacher':'course')
const composing=ref(false),message=ref(''),mutationError=ref(''),mutationBusy=ref(false),uncertain=ref(false),relatedAfter=ref('')
const courseFeed=ref<InstanceType<typeof ReviewFeed>>(),mentorFeed=ref<InstanceType<typeof ReviewFeed>>(),statistics=ref<InstanceType<typeof StatisticsSection>>()
const mutation=new Mutation()
const entry=useLoad(async signal=>{const data=await summary(id.value,signal);if(data.object.kind!==kind.value)throw new AcademicError('not_found');return data})
const related=useLoad(signal=>objects(kind.value==='course'?{kind:'teacher',course_id:id.value,after:relatedAfter.value}:{kind:'course',teacher_id:id.value,after:relatedAfter.value},signal))
watch(id,()=>{composing.value=false;message.value='';relatedAfter.value='';void entry.load();void related.load()},{immediate:true})
function published(result:Result){message.value=result.state==='pending'?'pending':'published';composing.value=false;statistics.value?.refresh();courseFeed.value?.refresh();mentorFeed.value?.refresh()}
function nextRelated(){relatedAfter.value=related.data.value?.next??'';void related.load()}
async function bookmark(){
  if(mutationBusy.value)return
  mutationBusy.value=true;mutationError.value=''
  try{await mutation.run('reviews','/me/bookmarks','Result',{target_id:id.value,set:true});message.value='bookmarked'}
  catch(error){mutationError.value=error instanceof AcademicError?error.code:'unavailable'}
  finally{mutationBusy.value=false;uncertain.value=mutation.uncertain}
}
</script>
<template>
  <section class="academic-page">
    <LoadState
      :busy="entry.busy.value"
      :error="entry.error.value"
      @retry="entry.load"
    />
    <template v-if="entry.data.value">
      <header class="academic-profile-header">
        <p class="eyebrow">
          {{ t(kind==='course'?'academic.courseHome':'academic.teacherHome') }}
        </p><h1>{{ entry.data.value.object.name }}</h1><p class="academic-muted">
          {{ entry.data.value.school.name }}<span v-if="entry.data.value.department">{{ entry.data.value.department.name }}</span>
        </p>
        <div class="academic-actions">
          <button
            v-if="!composing"
            @click="composing=true"
          >
            {{ t(kind==='course'?'academic.writeReview':'academic.writeMentor') }}
          </button><button
            v-if="kind==='course'"
            :disabled="mutationBusy"
            @click="bookmark"
          >
            {{ t(uncertain?'academic.retry':'academic.bookmark') }}
          </button>
        </div>
      </header>
      <p
        v-if="message"
        role="status"
      >
        {{ t(`academic.${message}`) }}
      </p><p
        v-if="mutationError"
        role="alert"
      >
        {{ t(`academic.errors.${mutationError}`) }}
      </p>
      <ReviewEditor
        v-if="composing"
        :key="id"
        :kind="kind==='course'?'course':'mentor'"
        :target-id="id"
        :school-id="entry.data.value.object.school_id"
        @submitted="published"
        @cancel="composing=false"
      />
      <section class="academic-card">
        <h2>{{ t('academic.basicInfo') }}</h2><dl class="academic-facts">
          <div><dt>{{ t('academic.school') }}</dt><dd>{{ entry.data.value.school.name }}</dd></div>
          <div><dt>{{ t(kind==='course'?'academic.college':'academic.department') }}</dt><dd>{{ entry.data.value.department?.name??t('academic.unknown') }}</dd></div>
          <template v-if="kind==='course'">
            <div><dt>{{ t('academic.code') }}</dt><dd>{{ entry.data.value.object.code||t('academic.unknown') }}</dd></div><div><dt>{{ t('academic.creditsLabel') }}</dt><dd>{{ entry.data.value.object.credits===null?t('academic.unknownCredits'):n(entry.data.value.object.credits) }}</dd></div>
            <div>
              <dt>{{ t('academic.category') }}</dt><dd>
                <template v-if="entry.data.value.categories.length">
                  <RouterLink
                    v-for="category in entry.data.value.categories"
                    :key="category.id"
                    class="academic-tag"
                    :to="{path:'/courses',query:{school:entry.data.value.school.id,category:category.id}}"
                  >
                    {{ category.name }}
                  </RouterLink>
                </template><span v-else>{{ t('academic.unknown') }}</span>
              </dd>
            </div>
            <div>
              <dt>{{ t('academic.nature') }}</dt><dd>
                <template v-if="entry.data.value.natures.length">
                  <RouterLink
                    v-for="nature in entry.data.value.natures"
                    :key="nature.id"
                    class="academic-tag"
                    :to="{path:'/courses',query:{school:entry.data.value.school.id,nature:nature.id}}"
                  >
                    {{ nature.name }}
                  </RouterLink>
                </template><span v-else>{{ t('academic.unknown') }}</span>
              </dd>
            </div>
          </template>
          <div v-if="entry.data.value.object.aliases.length">
            <dt>{{ t('academic.aliases') }}</dt><dd>{{ entry.data.value.object.aliases.join(' · ') }}</dd>
          </div>
        </dl><h3>{{ t('academic.biography') }}</h3><p class="review-body">
          {{ entry.data.value.object.biography||t('academic.unknown') }}
        </p>
      </section>
      <StatisticsSection
        ref="statistics"
        :kind="kind"
        :target-id="id"
      />
      <section>
        <h2>{{ t(kind==='course'?'academic.taughtBy':'academic.taughtCourses') }}</h2><LoadState
          :busy="related.busy.value"
          :error="related.error.value"
          :empty="related.data.value?.items.length===0"
          @retry="related.load"
        />
        <ul class="academic-grid">
          <li
            v-for="item in related.data.value?.items"
            :key="item.id"
            class="academic-card"
          >
            <RouterLink :to="`/${kind==='course'?'teachers':'courses'}/${encodeURIComponent(item.id)}`">
              <h3>{{ item.name }}</h3>
            </RouterLink><p v-if="kind==='teacher'">
              {{ item.credits===null?t('academic.unknownCredits'):t('academic.credits',{credits:n(item.credits)}) }}
            </p>
          </li>
        </ul>
        <div class="academic-actions">
          <button
            v-if="relatedAfter"
            @click="relatedAfter='';related.load()"
          >
            {{ t('academic.first') }}
          </button><button
            v-if="related.data.value?.next"
            @click="nextRelated"
          >
            {{ t('academic.next') }}
          </button>
        </div>
      </section>
      <section>
        <h2>{{ t(kind==='course'?'academic.reviews':'academic.courseReviewsByTeacher') }}</h2><ReviewFeed
          ref="courseFeed"
          kind="course"
          :target-id="kind==='course'?id:undefined"
          :teacher-id="kind==='teacher'?id:undefined"
          :school-id="entry.data.value.school.id"
          filterable
        />
      </section>
      <section v-if="kind==='teacher'">
        <h2>{{ t('academic.mentorReviews') }}</h2><ReviewFeed
          ref="mentorFeed"
          kind="mentor"
          :target-id="id"
        />
      </section>
      <OfferingsSection
        :course-id="kind==='course'?id:undefined"
        :teacher-id="kind==='teacher'?id:undefined"
        :school-id="entry.data.value.school.id"
      />
    </template>
  </section>
</template>
