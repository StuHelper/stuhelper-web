<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRatingText } from '../presentation'
import RatingIcon from '../RatingIcon.vue'
import { dimensionNames, type DimensionName } from './levels'
// A level as a face and a word; the exact score is never shown.
const props = withDefaults(defineProps<{ level: number; dim?: DimensionName; schoolId?: string }>(), { dim: 'recommendation', schoolId: undefined })
const { t } = useI18n()
const ratingText = useRatingText(() => props.schoolId, 'browse')
</script>
<template>
  <span
    class="d-level"
    :class="level && !['difficulty', 'workload'].includes(props.dim) ? `tone-${level}` : ''"
  ><RatingIcon
    v-if="level"
    :dimension="dimensionNames.indexOf(props.dim)"
    :level="level"
  />{{ level ? ratingText(dimensionNames.indexOf(props.dim), level) : t('browse.levelNone') }}</span>
</template>
