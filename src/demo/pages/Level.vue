<script setup lang="ts">
import { dimensions } from '../../features/academic/api'
import RatingIcon from '../../features/academic/RatingIcon.vue'
import { levelText } from '../store'
// 五级文字加表情，不显示精确评分。
defineProps<{ dim: keyof typeof levelText; level: number }>()
</script>
<template>
  <span class="d-level"><RatingIcon :dimension="dimensions.indexOf(dim)" :level="level" />{{ levelText[dim][level] }}</span>
</template>
