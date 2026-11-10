<script setup lang="ts">
import { useInView } from '../inView'
import { computed, ref } from 'vue'
import { dimLabels } from '../store'
// 五个维度的雷达图，数值是五档档位。支持多组叠加。
const props = withDefaults(defineProps<{ series: { name: string; values: number[] }[]; size?: number }>(), { size: 260 })
const colors = ['var(--accent-fill)', 'var(--c-pink)', 'var(--c-green)', 'var(--c-orange)']
const c = 130; const R = 84
const pt = (i: number, r: number) => { const a = (Math.PI * 2 * i) / 5 - Math.PI / 2; return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const }
// 左右两侧的标签向外对齐，不压住顶点。
const anchor = (i: number) => { const dx = pt(i, R)[0] - c; return Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end' }
const ring = (lv: number) => [0, 1, 2, 3, 4].map((i) => pt(i, (R * lv) / 5).join(',')).join(' ')
const shape = (v: number[]) => v.map((x, i) => pt(i, (R * x) / 5).join(',')).join(' ')
const text = computed(() => props.series.map((s) => `${s.name}: ${dimLabels.map((l, i) => `${l} ${s.values[i]}/5`).join(', ')}`).join('; '))
const root = ref<SVGSVGElement>()
const seen = useInView(root)
</script>
<template>
  <figure class="radar">
    <svg ref="root" :class="{ in: seen }" viewBox="-34 0 328 260" :style="{ maxWidth: `${size}px` }" role="img" :aria-label="text">
      <polygon v-for="lv in 5" :key="lv" :points="ring(lv)" fill="none" stroke="var(--separator)" />
      <line v-for="i in 5" :key="i" :x1="c" :y1="c" :x2="pt(i - 1, R)[0]" :y2="pt(i - 1, R)[1]" stroke="var(--separator)" />
      <g v-for="(s, si) in series" :key="s.name" class="shape"><polygon :points="shape(s.values)" :fill="colors[si]" fill-opacity=".14" :stroke="colors[si]" stroke-width="2" stroke-linejoin="round" /><circle v-for="(x, i) in s.values" :key="i" :cx="pt(i, (R * x) / 5)[0]" :cy="pt(i, (R * x) / 5)[1]" r="3" :fill="colors[si]" /></g>
      <text v-for="(l, i) in dimLabels" :key="l" :x="pt(i, R + 12)[0]" :y="pt(i, R + 16)[1]" :text-anchor="anchor(i)" dominant-baseline="middle" font-size="11" fill="var(--label-2)">{{ l }}</text>
    </svg>
    <figcaption v-if="series.length > 1"><span v-for="(s, i) in series" :key="s.name"><i :style="{ background: colors[i] }" />{{ s.name }}</span></figcaption>
  </figure>
</template>
<style scoped>
.shape { opacity: 0; transform: scale(.6); transform-origin: 130px 130px; transition: opacity .35s, transform .55s var(--ease-out); }
.in .shape { opacity: 1; transform: none; }
.radar { min-width: 0; }
svg { display: block; width: 100%; margin-inline: auto; }
figcaption { display: flex; flex-wrap: wrap; justify-content: center; gap: .25rem 1rem; margin-block-start: .5rem; color: var(--label-2); font-size: .8125rem; }
figcaption span { display: inline-flex; align-items: center; gap: .375rem; }
figcaption i { width: 10px; height: 10px; border-radius: 50%; }
</style>
