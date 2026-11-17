<script setup lang="ts">
import { MessageSquareDashed, Scale } from 'lucide-vue-next'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import EmptyState from '../../shared/ui/EmptyState.vue'
import SideDrawer from '../../shared/ui/SideDrawer.vue'
import { toast } from '../../shared/ui/toast'
import { useCampusId } from '../account/access'
import FavoriteButton from '../favorites/FavoriteButton.vue'
import { useResourcesApi } from '../resources/api'
import { compareList, maxCompare, toggleCompare } from '../search/compare'
import { knownCredits, useAcademic } from './api'
import { dimensionLabelKeys, dimensionNames, recommendationLevel } from './ratings/levels'
import RatingDistribution from './ratings/RatingDistribution.vue'
import RatingLevel from './ratings/RatingLevel.vue'
import RatingRadar from './ratings/RatingRadar.vue'
import RatingTrend from './ratings/RatingTrend.vue'

// Key facts about a course or teacher without leaving the list: ratings by dimension,
// distribution, per-term trend, related people, the most upvoted review and resources.
// Each block loads on its own so one failed source does not hide the others.
// The list passes the name and subtitle it already shows, so the heading is there at once.
const props = defineProps<{ kind: 'course' | 'teacher'; id?: string; name?: string; note?: string }>()
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
// Teacher ratings come from course reviews attributed to the teacher, so both kinds query course reviews.
const top = useAsync(async (signal) => (props.id ? (await api.reviews({ kind: 'course', ...(props.kind === 'course' ? { target_id: props.id } : { teacher_id: props.id }), sort: 'upvotes', limit: 1 }, signal)).items[0] : undefined))
const files = useAsync(async (signal) => (props.id && props.kind === 'course' ? (await resources.list({ school_id: campus.value, course_id: props.id, sort: 'newest' }, signal)).items.slice(0, 3) : []))

function load() {
  for (const part of [summary, ratings, people, top, files]) void part.reload()
}
watch(() => props.id, (id) => {
  if (id) load()
}, { immediate: true })

const object = computed(() => summary.data.value?.object)
const name = computed(() => object.value?.name ?? props.name ?? '')
const note = computed(() => {
  const s = summary.data.value
  if (!s) return props.note ?? ''
  const credits = knownCredits(s.object)
  return [s.object.code, s.department?.name, credits === undefined ? '' : t('academic.subject.credits', { credits: format.value.number(credits) })].filter(Boolean).join(' · ')
})
const levels = computed(() => ratings.data.value?.dimensions.map((band) => band.level) ?? [0, 0, 0, 0, 0])
const recommendation = computed(() => recommendationLevel[ratings.data.value?.recommendation ?? 'unrated'])
const distribution = computed(() => ratings.data.value?.distribution?.[0])
// The trend reads left to right in time, so terms are ordered by term_order_key (oldest
// first, unknown terms last). Without the key the server's order is kept.
const terms = computed(() => {
  const list = [...(ratings.data.value?.terms ?? [])]
  if (list.some((term) => typeof term.term_order_key === 'number')) list.sort((a, b) => (a.term_order_key || Number.MAX_SAFE_INTEGER) - (b.term_order_key || Number.MAX_SAFE_INTEGER) || a.term_id.localeCompare(b.term_id))
  return list.map((term) => ({ name: term.term_name, level: recommendationLevel[term.recommendation], samples: term.review_count }))
})
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
    <div
      v-if="summary.status.value === 'error'"
      class="notice notice-error"
      role="alert"
    >
      <span>{{ t('browse.quickViewUnavailable') }}</span>
      <button
        class="btn btn-sm"
        type="button"
        @click="load"
      >
        {{ t('common.retry') }}
      </button>
    </div>
    <p
      v-if="object?.biography"
      class="muted small"
    >
      {{ object.biography }}
    </p>
    <!-- The placeholder has the outline of the rating blocks, so the drawer does not jump when they arrive. -->
    <div
      v-if="ratings.status.value === 'loading'"
      class="skeleton quick-skeleton"
      aria-busy="true"
    >
      <span class="visually-hidden">{{ t('common.loading') }}</span>
      <span
        class="quick-skeleton-card"
        aria-hidden="true"
      />
      <span
        class="block-tall"
        aria-hidden="true"
      />
    </div>
    <template v-else-if="ratings.data.value?.review_count">
      <!-- The verdict in words first; the charts below give the shape and the trend. -->
      <section
        class="card verdict appear"
        :aria-label="t('browse.recommendation')"
      >
        <div class="verdict-main">
          <span class="subtle">{{ t('browse.recommendation') }}</span>
          <RatingLevel
            class="verdict-level"
            :level="recommendation"
          />
          <span class="subtle">{{ t('browse.totalReviews', { p0: format.number(ratings.data.value.review_count) }) }}</span>
        </div>
        <dl class="verdict-dims">
          <div
            v-for="(dimension, index) in dimensionNames.slice(1)"
            :key="dimension"
          >
            <dt>{{ t(dimensionLabelKeys[dimension]) }}</dt>
            <dd>
              <RatingLevel
                :level="levels[index + 1] ?? 0"
                :dim="dimension"
              />
            </dd>
          </div>
        </dl>
      </section>
      <RatingRadar :series="[{ name, values: levels }]" />
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
    <EmptyState
      v-else-if="ratings.status.value === 'ready'"
      :text="t('browse.noReviews')"
      :icon="MessageSquareDashed"
    />
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
.verdict { display: grid; gap: .875rem; grid-template-columns: minmax(0, 11rem) minmax(0, 1fr); align-items: center; }
.verdict-main { display: grid; gap: .25rem; justify-items: start; }
.verdict-level { font-size: 1.375rem; font-weight: 680; white-space: normal; }
.verdict-level :deep(svg) { width: 1.5rem; height: 1.5rem; }
.verdict-dims { display: grid; gap: .5rem .875rem; grid-template-columns: repeat(2, minmax(0, 1fr)); padding-inline-start: .875rem; border-inline-start: .5px solid var(--separator); }
.verdict-dims dt { color: var(--label-3); font-size: .75rem; }
.verdict-dims :deep(.d-level) { white-space: normal; }
@media (max-width: 420px) {
  .verdict { grid-template-columns: minmax(0, 1fr); }
  .verdict-dims { padding-inline-start: 0; padding-block-start: .75rem; border-inline-start: 0; border-block-start: .5px solid var(--separator); }
}
.quick-skeleton span.quick-skeleton-card[aria-hidden] { width: 100%; height: 6.5rem; }
.links { display: flex; flex-wrap: wrap; gap: .25rem 1rem; font-size: .9375rem; }
.links.column { display: grid; }
.quote { display: grid; gap: .25rem; padding: .75rem 1rem; border-radius: var(--radius-sm); background: var(--fill); color: inherit; text-decoration: none; }
.quote:hover { background: var(--fill-strong); }
.clamp-3 { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
</style>
