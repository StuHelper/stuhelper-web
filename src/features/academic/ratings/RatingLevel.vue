<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import RatingIcon from '../RatingIcon.vue'
import { dimensionNames, levelKeys, type DimensionName } from './levels'
// A level as a face and a word; the exact score is never shown.
const props = withDefaults(defineProps<{ level: number; dim?: DimensionName }>(), { dim: 'recommendation' })
const { t } = useI18n()
</script>
<template>
  <span class="d-level"><RatingIcon
    v-if="level"
    :dimension="dimensionNames.indexOf(props.dim)"
    :level="level"
  />{{ t(levelKeys[props.dim][level] ?? 'browse.levelNone') }}</span>
</template>
