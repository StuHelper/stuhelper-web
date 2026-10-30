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
          <span
            class="band-symbol"
            aria-hidden="true"
          >{{ ratingSymbol(index, bands[index]?.level ?? 0) }}</span>
          <span>{{ text(index, bands[index]?.level ?? 0) }}</span>
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
.bands { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); margin: 0; }
.band { display: grid; gap: .2rem; padding: .7rem .8rem; border-radius: var(--radius-sm); background: var(--surface-muted); }
.band dt { font-size: .8rem; color: var(--muted); }
.band dd { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin: 0; font-weight: 600; }
.band small { flex-basis: 100%; font-weight: 400; }
.band-symbol { font-size: 1.05rem; }
.compact { grid-template-columns: repeat(auto-fill, minmax(min(100%, 8.5rem), 1fr)); gap: .4rem; }
.compact .band { padding: .45rem .6rem; }
</style>
