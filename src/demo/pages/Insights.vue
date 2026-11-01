<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { computed, ref } from 'vue'
import { dimLabels, dimNames, levelsOf } from '../store'
import CollapseSection from '../../shared/ui/CollapseSection.vue'
import { statDims } from '../data'
import Dist from './Dist.vue'
import Radar from './Radar.vue'
import Trend from './Trend.vue'
const { t: tr } = useI18n()
const props = defineProps<{ kind: 'course' | 'teacher'; id: string }>()
const levels = computed(() => levelsOf(props.kind, props.id))
const dim = ref<(typeof dimNames)[number]>('recommendation')
const stats = computed(() => statDims(levels.value))
const index = computed(() => dimNames.indexOf(dim.value))
</script>
<template>
  <CollapseSection :label="tr('demo.statsCharts')" storage-key="demo-insights-open">
    <div class="charts">
      <div class="card stack"><h3 class="d-title">{{ tr('demo.fiveDimensions') }}</h3><Radar :series="[{ name: tr('demo.thisPage'), values: levels }]" :size="320" /></div>
      <div class="card stack"><div class="row-between"><h3 class="d-title">{{ tr('demo.scoreDistribution') }}</h3><AppSelect v-model="dim" class="select dim-select" :aria-label="tr('demo.distDimension')"><option v-for="(name, i) in dimNames" :key="name" :value="name">{{ dimLabels[i] }}</option></AppSelect></div><Dist :id="id" :level="levels[index] ?? 0" :dim="dim" :total="stats[index]?.samples ?? 0" /></div>
      <div class="card stack wide"><h3 class="d-title">{{ tr('demo.trendByTerm') }}</h3><Trend :id="id" :level="levels[0] ?? 0" :total="stats[0]?.samples ?? 0" /></div>
    </div>
  </CollapseSection>
</template>
<style scoped>
.charts { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); }
.wide { grid-column: 1 / -1; }
.dim-select { width: auto; }
</style>
