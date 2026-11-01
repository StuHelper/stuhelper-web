<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { dimensions, type Band } from './api'
import { useRatingText } from './presentation'
import RatingIcon from './RatingIcon.vue'

// Five-level wording and drawn symbols only; exact averages are never shown.
const props = withDefaults(defineProps<{ bands: Band[]; schoolId?: string; samples?: boolean; compact?: boolean; inline?: boolean; showCourses?: boolean }>(), { schoolId: undefined, samples: true, compact: false, showCourses: false })
const { t, n } = useI18n()
const text = useRatingText(toRef(props, 'schoolId'))
</script>

<template>
  <dl
    class="bands"
    :class="{ compact, inline }"
  >
    <div
      v-for="(name, index) in dimensions"
      :key="name"
      class="band"
    >
      <dt>{{ text(index, 0) }}</dt>
      <dd>
        <template v-if="(bands[index]?.level ?? 0) > 0">
          <span class="band-value">
            <RatingIcon
              :dimension="index"
              :level="bands[index]?.level ?? 0"
            />
            <span>{{ text(index, bands[index]?.level ?? 0) }}</span>
          </span>
          <span
            class="band-meter"
            aria-hidden="true"
          >
            <i
              v-for="level in 5"
              :key="level"
              :class="{ on: level <= (bands[index]?.level ?? 0) }"
            />
          </span>
        </template>
        <span
          v-else
          class="muted"
        >{{ t('academic.ratings.insufficient') }}</span>
        <small
          v-if="samples"
          class="subtle"
        >{{ showCourses ? t('academic.ratings.samples', { samples: n(bands[index]?.samples ?? 0), courses: n(bands[index]?.courses ?? 0) }) : t('academic.ratings.samplesOnly', { samples: n(bands[index]?.samples ?? 0) }) }}</small>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.bands { display: grid; gap: .625rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.band:first-child { grid-column: 1 / -1; }
@media (min-width: 720px) { .bands { grid-template-columns: repeat(5, minmax(0, 1fr)); } .band:first-child { grid-column: auto; } }
.band { display: grid; gap: .375rem; padding: .875rem 1rem; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-card); }
.band dt { color: var(--label-3); font-size: .8125rem; }
.band dd { display: grid; gap: .375rem; font-weight: 600; }
.band-value { display: flex; align-items: center; gap: .375rem; }
.band-meter { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
.band-meter i { height: 4px; border-radius: var(--pill); background: var(--fill-strong); transition: background-color .3s; }
.band-meter i.on { background: var(--accent-fill); }
.band small { font-weight: 400; }
.compact { gap: .375rem; }
.compact .band { gap: .25rem; padding: .5rem .75rem; background: var(--fill); box-shadow: none; border-radius: var(--radius-sm); }
.compact .band-meter { display: none; }
/* 行内模式用于评价卡片：五项排成紧凑标签。 */
.inline { display: flex; flex-wrap: wrap; gap: .25rem .875rem; }
.inline .band { display: flex; align-items: center; gap: .375rem; padding: 0; background: none; box-shadow: none; }
.inline .band dt { font-size: .75rem; }
.inline .band dd { font-size: .8125rem; font-weight: 550; }
.inline .band-meter { display: none; }
.inline :deep(svg) { width: .9375rem; height: .9375rem; }
</style>
