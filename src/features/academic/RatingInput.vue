<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { dimensions } from './api'
import { ratingSymbol, useRatingText } from './presentation'

// One radio group per dimension. Level 0 leaves a dimension unrated, which only
// affects that dimension's sample count.
const props = defineProps<{ schoolId: string; disabled?: boolean }>()
const ratings = defineModel<number[]>({ required: true })
const { t } = useI18n()
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
          <span aria-hidden="true">{{ ratingSymbol(index, level) }}</span>
          <span>{{ text(index, level) }}</span>
        </label>
        <label
          class="rating-option rating-skip"
          :class="{ chosen: !ratings[index] }"
        >
          <input
            type="radio"
            :name="`rating-${name}`"
            :value="0"
            :checked="!ratings[index]"
            @change="choose(index, 0)"
          >
          <span>{{ t('academic.editor.unrated') }}</span>
        </label>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.rating-input { display: grid; gap: .9rem; }
.rating-group { display: grid; gap: .4rem; }
.rating-group legend { font-size: .88rem; font-weight: 620; margin-block-end: .35rem; }
.rating-options { display: flex; flex-wrap: wrap; gap: .35rem; }
.rating-option { position: relative; display: inline-flex; align-items: center; gap: .3rem; padding: .3rem .65rem; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); font-size: .85rem; cursor: pointer; }
.rating-option input { position: absolute; opacity: 0; pointer-events: none; }
.rating-option:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }
.rating-option.chosen { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
.rating-skip { color: var(--muted); }
fieldset:disabled .rating-option { opacity: .6; cursor: not-allowed; }
</style>
