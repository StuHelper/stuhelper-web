<script setup lang="ts">
import { Scale } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import SideDrawer from '../../shared/ui/SideDrawer.vue'
import { toast } from '../../shared/ui/toast'
import { useCampusId } from '../account/access'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import { useResourcesApi } from '../resources/api'
import { compareList, maxCompare, toggleCompare } from '../search/compare'
import { knownCredits, useAcademic } from './api'
import { recommendationLevel } from './ratings/levels'
import RatingDistribution from './ratings/RatingDistribution.vue'
import RatingRadar from './ratings/RatingRadar.vue'
import RatingTrend from './ratings/RatingTrend.vue'

// Key facts about a course or teacher without leaving the list: ratings by dimension,
// distribution, per-term trend, related people, the most upvoted review and resources.
// Each block loads on its own so one failed source does not hide the others.
const props = defineProps<{ kind: 'course' | 'teacher'; id?: string }>()
defineEmits<{ close: [] }>()
const { t } = useI18n()
const format = useFormat()
const api = useAcademic()
const resources = useResourcesApi()
const campus = useCampusId()

const summary = useAsync(async (signal) => (props.id ? api.summary(props.id, signal) : undefined))
const ratings = useAsync(async (signal) => (props.id ? (await api.summaries(props.kind, [props.id], true, signal)).items[0] : undefined))
const people = useAsync(async (signal) => {
  if (!props.id) return []
  const page = await api.objects(props.kind === 'course' ? { kind: 'teacher', course_id: props.id, limit: 12 } : { kind: 'course', teacher_id: props.id, limit: 12 }, signal)
  return page.items
})
const top = useAsync(async (signal) => (props.id ? (await api.reviews({ kind: props.kind, ...(props.kind === 'course' ? { target_id: props.id } : { teacher_id: props.id }), sort: 'upvotes', limit: 1 }, signal)).items[0] : undefined))
const files = useAsync(async (signal) => (props.id && props.kind === 'course' ? (await resources.list({ school_id: campus.value, course_id: props.id, sort: 'newest' }, signal)).items.slice(0, 3) : []))

watch(() => props.id, (id) => {
  if (!id) return
  for (const part of [summary, ratings, people, top, files]) void part.reload()
}, { immediate: true })

const object = computed(() => summary.data.value?.object)
const name = computed(() => object.value?.name ?? '')
const note = computed(() => {
  const s = summary.data.value
  if (!s) return ''
  const credits = knownCredits(s.object)
  return [s.object.code, s.department?.name, credits === undefined ? '' : t('academic.subject.credits', { credits: format.value.number(credits) })].filter(Boolean).join(' · ')
})
const levels = computed(() => ratings.data.value?.dimensions.map((band) => band.level) ?? [0, 0, 0, 0, 0])
const recommendation = computed(() => recommendationLevel[ratings.data.value?.recommendation ?? 'unrated'])
const distribution = computed(() => ratings.data.value?.distribution?.[0])
const terms = computed(() => (ratings.data.value?.terms ?? []).map((term) => ({ name: term.term_name, level: recommendationLevel[term.recommendation], samples: term.review_count })))
const comparing = computed(() => !!props.id && compareList[props.kind].includes(props.id))
function compare() {
  if (props.id && !toggleCompare(props.kind, props.id)) toast(t('browse.compareLimit', { p0: format.value.number(maxCompare) }))
}
</script>

<template>
  <SideDrawer
    :open="!!id"
    :title="name"
    :note="note"
    @close="$emit('close')"
  >
    <p
      v-if="summary.status.value === 'error'"
      class="field-error"
      role="alert"
    >
      {{ t('browse.quickViewUnavailable') }}
    </p>
    <p
      v-if="object?.biography"
      class="muted small"
    >
      {{ object.biography }}
    </p>
    <template v-if="ratings.data.value?.review_count">
      <RatingRadar
        :series="[{ name, values: levels }]"
        :size="240"
      />
      <section
        v-if="distribution"
        class="stack-sm"
      >
        <h3 class="d-title">
          {{ t('browse.recommendationDist') }}
        </h3>
        <RatingDistribution
          :weights="distribution.weights"
          :samples="distribution.samples"
          :level="recommendation"
        />
      </section>
      <section
        v-if="terms.length"
        class="stack-sm"
      >
        <h3 class="d-title">
          {{ t('browse.trendByTerm') }}
        </h3>
        <RatingTrend :terms="terms" />
      </section>
    </template>
    <p
      v-else-if="ratings.status.value === 'ready'"
      class="muted small"
    >
      {{ t('browse.noReviews') }}
    </p>
    <section
      v-if="people.data.value?.length"
      class="stack-sm"
    >
      <h3 class="d-title">
        {{ t(kind === 'course' ? 'browse.instructors' : 'browse.taughtCourses') }}
      </h3>
      <ul class="links">
        <li
          v-for="p in people.data.value"
          :key="p.id"
        >
          <RouterLink :to="`/${kind === 'course' ? 'teachers' : 'courses'}/${encodeURIComponent(p.id)}`">
            {{ p.name }}
          </RouterLink>
        </li>
      </ul>
    </section>
    <section
      v-if="top.data.value"
      class="stack-sm"
    >
      <h3 class="d-title">
        {{ t('browse.topReview') }}
      </h3>
      <RouterLink
        class="quote"
        :to="`/reviews/${encodeURIComponent(top.data.value.id)}`"
      >
        <b>{{ top.data.value.title }}</b>
        <span class="muted small clamp-3">{{ top.data.value.body }}</span>
        <span class="subtle">{{ t('browse.upvotes', { p0: format.number(top.data.value.upvotes) }) }}</span>
      </RouterLink>
    </section>
    <section
      v-if="files.data.value?.length"
      class="stack-sm"
    >
      <h3 class="d-title">
        {{ t('browse.relatedResources') }}
      </h3>
      <ul class="links column">
        <li
          v-for="r in files.data.value"
          :key="r.id"
        >
          <RouterLink :to="`/resources/items/${encodeURIComponent(r.id)}`">
            {{ r.current?.metadata.title ?? r.id }}
          </RouterLink>
        </li>
      </ul>
    </section>
    <template #footer>
      <FavoriteButton
        v-if="id"
        :id="id"
        :kind="kind"
        text
      />
      <button
        class="btn"
        type="button"
        :aria-pressed="comparing"
        @click="compare"
      >
        <Scale aria-hidden="true" />{{ comparing ? t('browse.inCompare') : t('browse.addToCompare') }}
      </button>
      <RouterLink
        v-if="id"
        class="btn btn-primary"
        :to="`/${kind === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(id)}`"
      >
        {{ t('browse.viewDetails') }}
      </RouterLink>
    </template>
  </SideDrawer>
</template>

<style scoped>
.links { display: flex; flex-wrap: wrap; gap: .25rem 1rem; font-size: .9375rem; }
.links.column { display: grid; }
.quote { display: grid; gap: .25rem; padding: .75rem 1rem; border-radius: var(--radius-sm); background: var(--fill); color: inherit; text-decoration: none; }
.quote:hover { background: var(--fill-strong); }
.clamp-3 { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
</style>
