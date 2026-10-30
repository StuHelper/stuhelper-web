<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { dimensions, type Band } from './api'
import { ratingSymbol, useRatingText } from './presentation'

// Five-level wording and symbols only; exact averages are never shown.
const props = withDefaults(defineProps<{ bands: Band[]; schoolId?: string; samples?: boolean; compact?: boolean }>(), { schoolId: undefined, samples: true, compact: false })
const { t, n } = useI18n()
const text = useRatingText(toRef(props, 'schoolId'))
</script>

<template>
  <dl
    class="bands"
    :class="{ compact }"
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
            <span
              class="band-symbol"
              aria-hidden="true"
            >{{ ratingSymbol(index, bands[index]?.level ?? 0) }}</span>
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
        >{{ t('academic.ratings.samples', { samples: n(bands[index]?.samples ?? 0), courses: n(bands[index]?.courses ?? 0) }) }}</small>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.bands { display: grid; gap: .625rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); }
.band { display: grid; gap: .375rem; padding: .875rem 1rem; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-card); }
.band dt { color: var(--label-3); font-size: .8125rem; }
.band dd { display: grid; gap: .375rem; font-weight: 600; }
.band-value { display: flex; align-items: baseline; gap: .375rem; }
.band-symbol { font-size: 1.125rem; }
.band-meter { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
.band-meter i { height: 4px; border-radius: var(--pill); background: var(--fill-strong); transition: background-color .3s; }
.band-meter i.on { background: var(--accent-fill); }
.band small { font-weight: 400; }
.compact { grid-template-columns: repeat(auto-fill, minmax(min(100%, 8.5rem), 1fr)); gap: .375rem; }
.compact .band { gap: .25rem; padding: .5rem .75rem; background: var(--fill); box-shadow: none; border-radius: var(--radius-sm); }
.compact .band-meter { display: none; }
</style>
