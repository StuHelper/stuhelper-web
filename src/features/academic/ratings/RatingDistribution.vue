<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../../app/i18n'
import { useInView } from '../../../shared/composables/inView'
import { useRatingText } from '../presentation'
import RatingIcon from '../RatingIcon.vue'
import { dimensionNames, type DimensionName } from './levels'
// Relative bar lengths per band and the sample size. The server sends normalized weights
// (0-20, largest band = 20), never counts or percentages, so no exact score can be derived.
const props = withDefaults(defineProps<{ weights: number[]; samples: number; level: number; dim?: DimensionName; schoolId?: string }>(), { dim: 'recommendation', schoolId: undefined })
const { t } = useI18n()
const format = useFormat()
const ratingText = useRatingText(() => props.schoolId, 'browse')
const rows = computed(() => [5, 4, 3, 2, 1].map((lv) => ({ lv, w: Math.min(100, ((props.weights[lv - 1] ?? 0) / 20) * 100) })))
const root = ref<HTMLElement>()
const seen = useInView(root)
</script>
<template>
  <div class="stack-sm">
    <ul
      ref="root"
      class="dist"
      :class="{ in: seen }"
    >
      <li
        v-for="r in rows"
        :key="r.lv"
      >
        <span class="name"><RatingIcon
          :dimension="dimensionNames.indexOf(props.dim)"
          :level="r.lv"
        />{{ ratingText(dimensionNames.indexOf(props.dim), r.lv) }}</span><span
          class="track"
          aria-hidden="true"
        ><i
          :class="{ on: r.lv === level }"
          :style="{ width: `${r.w}%` }"
        /></span>
      </li>
    </ul>
    <p class="subtle">
      {{ t('browse.totalReviews', { p0: format.number(samples) }) }}
    </p>
  </div>
</template>
<style scoped>
.dist { display: grid; gap: .4375rem; }
li { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); align-items: center; gap: .5rem; font-size: .8125rem; }
.name { display: inline-flex; align-items: center; gap: .25rem; color: var(--label-2); white-space: nowrap; }
.track { height: 8px; overflow: hidden; border-radius: var(--pill); background: var(--fill); }
i { display: block; height: 100%; border-radius: inherit; background: var(--fill-strong); transform-origin: left; transform: scaleX(0); transition: width .5s var(--ease-out), transform .55s var(--ease-out); }
[dir="rtl"] i { transform-origin: right; }
.dist.in i { transform: none; }
i.on { background: var(--accent-fill); }
@media (prefers-reduced-motion: reduce) { i { transition: none; } }
</style>
