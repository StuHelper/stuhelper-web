<script setup lang="ts">
import { computed, ref } from 'vue'
import { useInView } from '../../../shared/composables/inView'
import { useRatingText } from '../presentation'
import { dimensionNames } from './levels'
// Five dimensions as a radar of band levels (0-5). Several series can be overlaid for comparison.
// The drawing is always left-to-right with explicit anchors, so labels sit outside the
// shape in right-to-left languages too; the label text itself keeps its own direction.
const props = withDefaults(defineProps<{ series: { name: string; values: number[] }[]; size?: number; schoolId?: string }>(), { size: 340, schoolId: undefined })
const ratingText = useRatingText(() => props.schoolId, 'browse')
const colors = ['var(--accent-fill)', 'var(--c-pink)', 'var(--c-green)', 'var(--c-orange)', 'var(--c-purple)']
const c = 130
const R = 84
// A long label breaks at the space nearest its middle, so side labels stay inside the drawing.
function lines(label: string) {
  if (label.length <= 12 || !label.includes(' ')) return [label]
  const middle = label.length / 2
  const at = [...label.matchAll(/ /g)].map((match) => match.index).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? -1
  return at < 0 ? [label] : [label.slice(0, at), label.slice(at + 1)]
}
const labels = computed(() => dimensionNames.map((_, index) => ratingText(index, 0)))
const pt = (i: number, r: number) => { const a = (Math.PI * 2 * i) / 5 - Math.PI / 2; return [c + Math.cos(a) * r, c + Math.sin(a) * r] as const }
// Side labels align outward so they do not cover the vertices.
const anchor = (i: number) => { const dx = pt(i, R)[0] - c; return Math.abs(dx) < 4 ? 'middle' : dx > 0 ? 'start' : 'end' }
const ring = (lv: number) => [0, 1, 2, 3, 4].map((i) => pt(i, (R * lv) / 5).join(',')).join(' ')
const shape = (v: number[]) => v.map((x, i) => pt(i, (R * x) / 5).join(',')).join(' ')
const text = computed(() => props.series.map((s) => `${s.name}: ${labels.value.map((l, i) => `${l} ${s.values[i] ?? 0}/5`).join(', ')}`).join('; '))
const root = ref<SVGSVGElement>()
const seen = useInView(root)
</script>
<template>
  <figure class="radar">
    <svg
      ref="root"
      :class="{ in: seen }"
      viewBox="-70 0 400 264"
      :style="{ maxWidth: `${size}px` }"
      role="img"
      :aria-label="text"
    >
      <polygon
        v-for="lv in 5"
        :key="lv"
        :points="ring(lv)"
        fill="none"
        stroke="var(--separator)"
      />
      <line
        v-for="i in 5"
        :key="i"
        :x1="c"
        :y1="c"
        :x2="pt(i - 1, R)[0]"
        :y2="pt(i - 1, R)[1]"
        stroke="var(--separator)"
      />
      <g
        v-for="(s, si) in series"
        :key="s.name + si"
        class="shape"
      >
        <polygon
          :points="shape(s.values)"
          :fill="colors[si % colors.length]"
          fill-opacity=".14"
          :stroke="colors[si % colors.length]"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <circle
          v-for="(x, i) in s.values"
          :key="i"
          :cx="pt(i, (R * x) / 5)[0]"
          :cy="pt(i, (R * x) / 5)[1]"
          r="3"
          :fill="colors[si % colors.length]"
        />
      </g>
      <text
        v-for="(l, i) in labels"
        :key="l"
        :y="pt(i, R + 16)[1] - (i === 0 ? (lines(l).length - 1) * 15 : 0)"
        :text-anchor="anchor(i)"
        dominant-baseline="middle"
        font-size="13"
        fill="var(--label-2)"
      ><tspan
        v-for="(line, row) in lines(l)"
        :key="row"
        :x="pt(i, R + 12)[0]"
        :dy="row ? 15 : 0"
      >{{ line }}</tspan></text>
    </svg>
    <figcaption v-if="series.length > 1">
      <span
        v-for="(s, i) in series"
        :key="s.name + i"
      ><i :style="{ background: colors[i % colors.length] }" />{{ s.name }}</span>
    </figcaption>
  </figure>
</template>
<style scoped>
.shape { opacity: 0; transform: scale(.6); transform-origin: 130px 130px; transition: opacity .35s, transform .55s var(--ease-out); }
.in .shape { opacity: 1; transform: none; }
.radar { min-width: 0; }
svg { display: block; width: 100%; margin-inline: auto; overflow: visible; direction: ltr; }
figcaption { display: flex; flex-wrap: wrap; justify-content: center; gap: .25rem 1rem; margin-block-start: .5rem; color: var(--label-2); font-size: .8125rem; }
figcaption span { display: inline-flex; align-items: center; gap: .375rem; }
figcaption i { width: 10px; height: 10px; border-radius: 50%; }
@media (prefers-reduced-motion: reduce) { .shape { transition: none; } }
</style>
