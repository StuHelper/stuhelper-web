<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { useInView } from '../inView'
import { dimensions } from '../../features/academic/api'
import RatingIcon from '../../features/academic/RatingIcon.vue'
import { distribution, levelText } from '../store'
const { t: tr } = useI18n()
// 只画各档相对多少和总样本量，不显示百分比，避免反推出精确评分。
const props = withDefaults(defineProps<{ id: string; level: number; dim?: keyof typeof levelText; total?: number }>(), { dim: 'recommendation' })
// 各档人数之和要等于统计卡片上的样本量，否则同一页会出现两个总数。
function scaled() {
  const list = distribution(props.id + props.dim, props.level)
  if (!props.total) return list
  const sum = list.reduce((a, b) => a + b, 0) || 1
  const out = list.map((n) => Math.round((n * props.total!) / sum))
  out[props.level - 1 >= 0 ? props.level - 1 : 0]! += props.total - out.reduce((a, b) => a + b, 0)
  return out
}
const rows = computed(() => { const list = scaled(); const max = Math.max(...list, 1); return list.map((n, i) => ({ lv: i + 1, n, w: (n / max) * 100 })).reverse() })
const root = ref<HTMLElement>()
const seen = useInView(root)
const total = computed(() => rows.value.reduce((s, r) => s + r.n, 0))
</script>
<template>
  <div class="stack-sm">
    <ul ref="root" class="dist" :class="{ in: seen }">
      <li v-for="r in rows" :key="r.lv"><span class="name"><RatingIcon :dimension="dimensions.indexOf(dim)" :level="r.lv" />{{ levelText[dim][r.lv] }}</span><span class="track" aria-hidden="true"><i :class="{ on: r.lv === level }" :style="{ width: `${r.w}%` }" /></span></li>
    </ul>
    <p class="subtle">{{ tr('demo.totalReviews', { p0: total }) }}</p>
  </div>
</template>
<style scoped>
.dist { display: grid; gap: .4375rem; }
li { display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); align-items: center; gap: .5rem; font-size: .8125rem; }
.name { display: inline-flex; align-items: center; gap: .25rem; color: var(--label-2); white-space: nowrap; }
.track { height: 8px; overflow: hidden; border-radius: var(--pill); background: var(--fill); }
i { display: block; height: 100%; border-radius: inherit; background: var(--fill-strong); transition: width .5s var(--ease-out); }
i.on { background: var(--accent-fill); }
.dist i { transform-origin: left; transform: scaleX(0); transition: width .5s var(--ease-out), transform .55s var(--ease-out); }
[dir="rtl"] .dist i { transform-origin: right; }
.dist.in i { transform: none; }
</style>
