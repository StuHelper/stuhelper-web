<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useInView } from '../inView'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import RatingIcon from '../../features/academic/RatingIcon.vue'
import { levelText, trend } from '../store'
const { t: tr } = useI18n()
// 各学期推荐度。纵轴是表情档位；样本不足的学期不画点，也不算作低分。
const props = defineProps<{ id: string; level: number; total?: number }>()
// 各学期样本之和与统计卡片一致。
const pts = computed(() => {
  const rows = trend(props.id, props.level)
  if (!props.total) return rows
  const sum = rows.reduce((a, r) => a + r.samples, 0) || 1
  const out = rows.map((r) => ({ ...r, samples: Math.round((r.samples * props.total!) / sum) }))
  out[out.length - 1]!.samples += props.total - out.reduce((a, r) => a + r.samples, 0)
  return out
})
const h = 132
// 按容器实际宽度绘制，文字不会随缩放变小。
const w = ref(320)
const AXIS = 92
const x = (i: number) => AXIS + 24 + (i * (w.value - AXIS - 60)) / Math.max(1, pts.value.length - 1)
const y = (lv: number) => 10 + ((5 - lv) * 76) / 4
const line = computed(() => pts.value.flatMap((p, i) => (p.level ? [`${x(i)},${y(p.level)}`] : [])).join(' '))
const label = computed(() => pts.value.map((p) => `${p.name}: ${p.level ? levelText.recommendation[p.level] : tr('demo.notEnoughData')}, ${p.samples}`).join('; '))
const root = ref<SVGSVGElement>()
const seen = useInView(root)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { if (entry) w.value = Math.max(280, entry.contentRect.width) })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <svg ref="root" class="trend" :class="{ in: seen }" :viewBox="`0 0 ${w} ${h}`" role="img" :aria-label="tr('demo.recommendationTrend', { p0: label })">
    <g v-for="lv in 5" :key="lv"><line :x1="AXIS" :x2="w - 18" :y1="y(lv)" :y2="y(lv)" stroke="var(--separator)" /><RatingIcon :dimension="0" :level="lv" x="0" :y="y(lv) - 7" width="14" height="14" /><text x="18" :y="y(lv) + 3.5" font-size="11" fill="var(--label-2)">{{ levelText.recommendation[lv] }}</text></g>
    <polyline class="line" pathLength="1" :points="line" fill="none" stroke="var(--accent-fill)" stroke-width="2" stroke-linejoin="round" />
    <g v-for="(p, i) in pts" :key="p.term">
      <circle v-if="p.level" :cx="x(i)" :cy="y(p.level)" r="4" fill="var(--accent-fill)"><title>{{ p.name }}：{{ levelText.recommendation[p.level] }}</title></circle>
      <text :x="x(i)" y="106" text-anchor="middle" font-size="11" fill="var(--label-2)">{{ p.term }}</text>
      <text :x="x(i)" y="122" text-anchor="middle" font-size="10" fill="var(--label-3)">{{ p.level ? tr('demo.countOnly', { p0: p.samples }) : tr('demo.notEnoughData') }}</text>
    </g>
  </svg>
</template>
<style scoped>
.trend { display: block; width: 100%; }
.line { stroke-dasharray: 1; stroke-dashoffset: 1; }
.in .line { animation: trend-draw .7s var(--ease-out) forwards; }
circle { opacity: 0; }
.in circle { opacity: 1; transition: opacity .3s .45s; }
@keyframes trend-draw { to { stroke-dashoffset: 0; } }
</style>
