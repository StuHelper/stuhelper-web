<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { hue } from '../../shared/hue'
import type { CourseCard } from './courseCard'
import RatingLevel from './ratings/RatingLevel.vue'

// The content of a course search result: the facts of a course list row on two lines.
// It holds no controls, so it can sit inside an option, a button or a link.
const props = defineProps<{ card: CourseCard }>()
const { t } = useI18n()
const format = useFormat()
const facts = computed(() => [
  props.card.code,
  props.card.credits === undefined ? '' : t('academic.subject.credits', { credits: format.value.number(props.card.credits) }),
  props.card.department,
  props.card.reviews === undefined ? '' : props.card.reviews ? t('browse.reviewCount', { p0: format.value.number(props.card.reviews) }) : t('browse.noReviews'),
].filter(Boolean).join(' · '))
</script>

<template>
  <span class="course-card">
    <span class="course-card-top">
      <strong class="truncate">{{ card.object.name }}</strong>
      <span
        v-if="card.category"
        class="tag tag-hue course-card-tag"
        :style="{ '--hue': hue(card.category.id) }"
      >{{ card.category.name }}</span>
    </span>
    <span class="course-card-facts subtle small">
      <span class="truncate">{{ facts }}</span>
      <RatingLevel
        v-if="card.level"
        :level="card.level"
        :school-id="card.object.school_id"
      />
    </span>
  </span>
</template>

<style scoped>
.course-card { display: grid; flex: 1; gap: .125rem; min-width: 0; text-align: start; }
.course-card-top, .course-card-facts { display: flex; align-items: center; gap: .5rem; min-width: 0; }
.course-card-tag { flex: none; }
.course-card-facts .d-level { flex: none; margin-inline-start: auto; }
</style>
