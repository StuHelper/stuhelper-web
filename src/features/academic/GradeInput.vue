<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Grade } from './api'
import ChoiceGroup from './ChoiceGroup.vue'

/**
 * The author's own grade for a course review, optional. One scale is chosen: a 0–100 score,
 * a five-level or a two-level grade, or "withdrawn", which needs no value. The model stays
 * undefined until the chosen scale has a valid value, so an unfinished score is never sent;
 * `incomplete` tells the editor to name the field as still missing.
 */
const props = defineProps<{ disabled?: boolean }>()
const model = defineModel<Grade | undefined>({ required: true })
const incomplete = defineModel<boolean>('incomplete', { default: false })
const { t } = useI18n()
const percentId = useId()
const hintId = useId()

type Scale = Grade['scale'] | ''
const scale = ref<Scale>(model.value?.scale ?? '')
const percent = ref(model.value?.scale === 'percent' ? String(model.value.value) : '')
const level = ref(model.value && (model.value.scale === 'five_level' || model.value.scale === 'two_level') ? model.value.value : '')

const scales = computed(() => (['', 'percent', 'five_level', 'two_level', 'withdrawn'] as const).map((value) => ({ value, label: t(`academic.grade.scales.${value || 'none'}`) })))
const fiveLevels = computed(() => (['excellent', 'good', 'medium', 'pass', 'fail'] as const).map((value) => ({ value, label: t(`academic.grade.five.${value}`) })))
const twoLevels = computed(() => (['pass', 'fail'] as const).map((value) => ({ value, label: t(`academic.grade.two.${value}`) })))
const percentValid = computed(() => /^\d{1,3}$/.test(percent.value.trim()) && Number(percent.value) <= 100)

function current(): Grade | undefined {
  switch (scale.value) {
    case 'percent': return percentValid.value ? { scale: 'percent', value: Number(percent.value.trim()) } : undefined
    case 'five_level': {
      const chosen = fiveLevels.value.find((item) => item.value === level.value)
      return chosen ? { scale: 'five_level', value: chosen.value } : undefined
    }
    case 'two_level': return level.value === 'pass' || level.value === 'fail' ? { scale: 'two_level', value: level.value } : undefined
    case 'withdrawn': return { scale: 'withdrawn' }
    default: return undefined
  }
}

// The scale chosen by the author. Level names differ between scales, so a level chosen on one
// scale is not carried over. A restored draft sets the scale and its level together and does
// not pass through here, so its level stays.
const chosenScale = computed({
  get: () => scale.value,
  set: (next: Scale) => {
    if (next !== scale.value) level.value = ''
    scale.value = next
  },
})
watch([scale, percent, level], () => {
  // model.value reads the parent's prop, which updates only after this callback.
  const next = current()
  model.value = next
  incomplete.value = !!scale.value && !next
}, { immediate: true })
// A restored draft replaces the whole value from outside.
watch(model, (value) => {
  if (JSON.stringify(value) === JSON.stringify(current())) return
  scale.value = value?.scale ?? ''
  percent.value = value?.scale === 'percent' ? String(value.value) : ''
  level.value = value && (value.scale === 'five_level' || value.scale === 'two_level') ? value.value : ''
})
</script>

<template>
  <div class="field grade-input">
    <ChoiceGroup
      v-model="chosenScale"
      :label="t('academic.grade.label')"
      :options="scales"
      :disabled="props.disabled"
    />
    <div
      v-if="scale === 'percent'"
      class="field"
    >
      <label
        class="field-label"
        :for="percentId"
      >{{ t('academic.grade.percentLabel') }}</label>
      <input
        :id="percentId"
        v-model="percent"
        class="input grade-percent"
        inputmode="numeric"
        maxlength="3"
        :disabled="props.disabled"
        :aria-invalid="!!percent && !percentValid"
        :aria-describedby="hintId"
      >
      <span
        v-if="percent && !percentValid"
        class="field-error"
        role="alert"
      >{{ t('academic.grade.percentInvalid') }}</span>
    </div>
    <ChoiceGroup
      v-else-if="scale === 'five_level'"
      v-model="level"
      :label="t('academic.grade.levelLabel')"
      :options="fiveLevels"
      :disabled="props.disabled"
    />
    <ChoiceGroup
      v-else-if="scale === 'two_level'"
      v-model="level"
      :label="t('academic.grade.levelLabel')"
      :options="twoLevels"
      :disabled="props.disabled"
    />
    <span
      :id="hintId"
      class="field-hint"
    >{{ t('academic.grade.hint') }}</span>
  </div>
</template>

<style scoped>
.grade-input { display: grid; gap: .625rem; }
.grade-percent { max-width: 8rem; }
</style>
