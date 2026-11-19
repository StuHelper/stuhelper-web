<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../../app/i18n'
import { useInView } from '../../../shared/composables/inView'
import { useRatingText } from '../presentation'
import RatingIcon from '../RatingIcon.vue'
// Recommendation per term. Terms without enough reviews (level 0) get no point and are not
// drawn as a low score.
const props = defineProps<{ terms: { name: string; level: number; samples: number }[]; schoolId?: string }>()
const { t } = useI18n()
const format = useFormat()
const ratingText = useRatingText(() => props.schoolId, 'browse')
const h = 132
// Drawn at the container's real width so text does not shrink with scaling.
const w = ref(320)
const y = (lv: number) => 10 + ((5 - lv) * 76) / 4
const levelName = (lv: number) => (lv > 0 ? ratingText(0, lv) : t('browse.levelNone'))
// The level words differ a lot in length between languages, so the axis column is as wide as
// the longest one. Without a canvas (unit tests) the width is estimated from the characters.
function textWidth(text: string) {
  const context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext?.('2d')
  if (!context) return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e7f ? 11 : 6.2), 0)
  context.font = `11px ${getComputedStyle(document.body).fontFamily}`
  return context.measureText(text).width
}
const AXIS = computed(() => Math.min(Math.max(72, 18 + Math.ceil(Math.max(...[1, 2, 3, 4, 5].map((lv) => textWidth(levelName(lv))))) + 12), w.value * .48))
const x = (i: number) => AXIS.value + 24 + (i * (w.value - AXIS.value - 60)) / Math.max(1, props.terms.length - 1)
const pointTitle = (p: { name: string; level: number }) => t('browse.termLevel', { term: p.name, level: levelName(p.level) })
const line = computed(() => props.terms.flatMap((p, i) => (p.level ? [`${x(i)},${y(p.level)}`] : [])).join(' '))
const label = computed(() => props.terms.map((p) => `${p.name}: ${p.level ? levelName(p.level) : t('browse.notEnoughData')}, ${p.samples}`).join('; '))
const root = ref<SVGSVGElement>()
const seen = useInView(root)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!window.ResizeObserver) return
  observer = new ResizeObserver(([entry]) => { if (entry) w.value = Math.max(280, entry.contentRect.width) })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <svg
    ref="root"
    class="trend"
    :class="{ in: seen }"
    :viewBox="`0 0 ${w} ${h}`"
    role="img"
    :aria-label="t('browse.recommendationTrend', { p0: label })"
  >
    <g
      v-for="lv in 5"
      :key="lv"
    ><line
      :x1="AXIS"
      :x2="w - 18"
      :y1="y(lv)"
      :y2="y(lv)"
      stroke="var(--separator)"
    /><RatingIcon
      :dimension="0"
      :level="lv"
      x="0"
      :y="y(lv) - 7"
      width="14"
      height="14"
    /><text
      x="18"
      :y="y(lv) + 3.5"
      font-size="11"
      fill="var(--label-2)"
    >{{ levelName(lv) }}</text></g>
    <polyline
      class="line"
      pathLength="1"
      :points="line"
      fill="none"
      stroke="var(--accent-fill)"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <g
      v-for="(p, i) in terms"
      :key="p.name + i"
    >
      <circle
        v-if="p.level"
        :cx="x(i)"
        :cy="y(p.level)"
        r="4"
        fill="var(--accent-fill)"
      ><title>{{ pointTitle(p) }}</title></circle>
      <text
        :x="x(i)"
        y="106"
        text-anchor="middle"
        font-size="11"
        fill="var(--label-2)"
      >{{ p.name }}</text>
      <text
        :x="x(i)"
        y="122"
        text-anchor="middle"
        font-size="10"
        fill="var(--label-3)"
      >{{ p.level ? t('browse.countOnly', { p0: format.number(p.samples) }) : t('browse.notEnoughData') }}</text>
    </g>
  </svg>
</template>
<style scoped>
/* Drawn left-to-right in every language: the axis words keep clear of the faces and of the plot. */
.trend { display: block; width: 100%; direction: ltr; }
.line { stroke-dasharray: 1; stroke-dashoffset: 1; }
.in .line { animation: trend-draw .7s var(--ease-out) forwards; }
circle { opacity: 0; }
.in circle { opacity: 1; transition: opacity .3s .45s; }
@keyframes trend-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .line { stroke-dashoffset: 0; } .in .line { animation: none; } }
</style>
