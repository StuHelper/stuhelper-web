<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { AcademicError, call, Mutation, object, objects, query, type ReviewPage, type Statistics, type Result } from './api'
import { useLoad } from './useLoad'
import LoadState from './LoadState.vue'
import RatingBands from './RatingBands.vue'
import ReviewCard from './ReviewCard.vue'
import ReviewEditor from './ReviewEditor.vue'
const route = useRoute(), { t } = useI18n()
const id = computed(() => String(route.params.id)), kind = computed(() => route.path.startsWith('/teachers/') ? 'teacher' : 'course')
const after = ref(''), relatedAfter = ref(''), statsAfter = ref(''), composing = ref(false), message = ref(''), mutationError = ref(''), mutationBusy = ref(false), uncertain = ref(false)
const mutation = new Mutation()
const entry = useLoad(signal => object(id.value,signal))
const stats = useLoad(signal => call<Statistics>('reviews','/statistics'+query({kind:kind.value,target_id:id.value,after:statsAfter.value}),'Statistics',{signal}))
const related = useLoad(signal => objects(kind.value === 'course' ? {kind:'teacher',course_id:id.value,after:relatedAfter.value} : {kind:'course',teacher_id:id.value,after:relatedAfter.value},signal))
const reviews = useLoad(signal => call<ReviewPage>('reviews',query({kind:kind.value === 'course' ? 'course' : 'mentor',target_id:id.value,after:after.value}),'Page',{signal}))
function published(result:Result){message.value=result.state==='pending'?'pending':'published';composing.value=false;refresh()}
function refresh() { void stats.load(); void reviews.load() }
watch(id, () => { after.value='';relatedAfter.value='';statsAfter.value='';composing.value=false;void entry.load();void related.load();refresh() },{immediate:true})
function nextReviews() { after.value = reviews.data.value?.next ?? ''; void reviews.load() }
function nextRelated() { relatedAfter.value = related.data.value?.next ?? ''; void related.load() }
function nextStats() { statsAfter.value = stats.data.value?.next ?? ''; void stats.load() }
async function bookmark() {
  mutationBusy.value=true;mutationError.value=''
  try { await mutation.run('reviews','/me/bookmarks','Result',{target_id:id.value,set:true});message.value='bookmarked' }
  catch(failure){mutationError.value=failure instanceof AcademicError ? failure.code : 'unavailable'}
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
      <header>
        <p class="eyebrow">
          {{ t(kind === 'course' ? 'academic.courses' : 'academic.teacherHome') }}
        </p><h1>{{ entry.data.value.name }}</h1><p>{{ entry.data.value.code }}</p><p class="review-body">
          {{ entry.data.value.biography }}
        </p>
      </header>
      <div class="academic-actions">
        <button @click="composing = !composing">
          {{ t(kind === 'course' ? 'academic.writeReview' : 'academic.writeMentor') }}
        </button><button
          v-if="kind === 'course'"
          :disabled="mutationBusy"
          @click="bookmark"
        >
          {{ t(uncertain ? 'academic.retry' : 'academic.bookmark') }}
        </button>
      </div>
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
        :kind="kind === 'course' ? 'course' : 'mentor'"
        :target-id="id"
        :school-id="entry.data.value.school_id"
        @submitted="published"
      />
      <section>
        <h2>{{ t('academic.ratingSummary') }}</h2><p>{{ t(kind === 'teacher' ? 'academic.teacherRatingHint' : 'academic.ratingScope') }}</p><LoadState
          :busy="stats.busy.value"
          :error="stats.error.value"
          @retry="stats.load"
        /><RatingBands
          v-if="stats.data.value"
          :dimensions="stats.data.value.dimensions"
        />
      </section>
      <section>
        <h2>{{ t(kind === 'course' ? 'academic.taughtBy' : 'academic.taughtCourses') }}</h2><LoadState
          :busy="related.busy.value"
          :error="related.error.value"
          :empty="related.data.value?.items.length === 0"
          @retry="related.load"
        /><ul class="academic-grid">
          <li
            v-for="item in related.data.value?.items"
            :key="item.id"
            class="academic-card"
          >
            <RouterLink :to="`/${kind === 'course' ? 'teachers' : 'courses'}/${item.id}`">
              {{ item.name }}
            </RouterLink>
          </li>
        </ul><button
          v-if="related.data.value?.next"
          @click="nextRelated"
        >
          {{ t('academic.next') }}
        </button>
      </section>
      <section v-if="kind === 'teacher' && stats.data.value?.courses.length">
        <h2>{{ t('academic.ratedCourses') }}</h2><div
          v-for="course in stats.data.value.courses"
          :key="course.course_id"
          class="academic-card"
        >
          <RouterLink :to="`/courses/${course.course_id}`">
            {{ related.data.value?.items.find(item => item.id === course.course_id)?.name ?? t('academic.viewCourse') }}
          </RouterLink><RatingBands :dimensions="course.dimensions" />
        </div><button
          v-if="stats.data.value.next"
          @click="nextStats"
        >
          {{ t('academic.next') }}
        </button>
      </section>
      <section>
        <h2>{{ t(kind === 'course' ? 'academic.reviews' : 'academic.mentorReviews') }}</h2><LoadState
          :busy="reviews.busy.value"
          :error="reviews.error.value"
          :empty="reviews.data.value?.items.length === 0"
          @retry="reviews.load"
        /><ReviewCard
          v-for="review in reviews.data.value?.items"
          :key="review.id"
          :review="review"
          @changed="refresh"
        /><button
          v-if="reviews.data.value?.next"
          @click="nextReviews"
        >
          {{ t('academic.next') }}
        </button>
      </section>
    </template>
  </section>
</template>
