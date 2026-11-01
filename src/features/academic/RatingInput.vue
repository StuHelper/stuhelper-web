<script setup lang="ts">
import { toRef } from 'vue'
import { dimensions } from './api'
import { useRatingText } from './presentation'
import RatingIcon from './RatingIcon.vue'

// One radio group per dimension. Level 0 means not chosen yet; publishing needs all five.
const props = defineProps<{ schoolId: string; disabled?: boolean }>()
const ratings = defineModel<number[]>({ required: true })
const text = useRatingText(toRef(props, 'schoolId'))

function choose(index: number, level: number) {
  const next = ratings.value.slice()
  next[index] = level
  ratings.value = next
}
</script>

<template>
  <div class="rating-input">
    <fieldset
      v-for="(name, index) in dimensions"
      :key="name"
      class="rating-group"
      :disabled="disabled"
    >
      <legend>{{ text(index, 0) }}</legend>
      <div class="rating-options">
        <label
          v-for="level in [1, 2, 3, 4, 5]"
          :key="level"
          class="rating-option"
          :class="{ chosen: ratings[index] === level }"
        >
          <input
            type="radio"
            :name="`rating-${name}`"
            :value="level"
            :checked="ratings[index] === level"
            @change="choose(index, level)"
          >
          <RatingIcon
            :dimension="index"
            :level="level"
            :mono="ratings[index] === level"
          />
          <span>{{ text(index, level) }}</span>
        </label>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.rating-input { display: grid; gap: 1.125rem; }
.rating-group { display: grid; gap: .5rem; }
.rating-group legend { margin-block-end: .5rem; color: var(--label-2); font-size: .8125rem; font-weight: 500; }
.rating-options { display: flex; flex-wrap: wrap; gap: .375rem; }
.rating-option { position: relative; display: inline-flex; align-items: center; gap: .25rem; min-height: 36px; padding: .25rem .875rem; border-radius: var(--pill); background: var(--fill); font-size: .875rem; cursor: pointer; transition: background-color .2s, color .2s, transform .35s var(--spring); }
.rating-option:hover { background: var(--fill-strong); }
.rating-option:active { transform: scale(.95); }
.rating-option input { position: absolute; opacity: 0; pointer-events: none; }
.rating-option:focus-within { outline: 3px solid color-mix(in srgb, var(--accent-fill) 55%, transparent); outline-offset: 2px; }
.rating-option.chosen { background: var(--accent-fill); color: var(--on-accent); font-weight: 550; }
fieldset:disabled .rating-option { opacity: .5; cursor: default; }
@media (pointer: coarse) { .rating-option { min-height: 42px; } }
</style>
