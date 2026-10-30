<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { attribute, localName, type Field, type Value } from './api'

// Input for one category-configured field. Pages never branch on category names.
const props = withDefaults(defineProps<{ field: Field; filter?: boolean; disabled?: boolean }>(), { filter: false, disabled: false })
const model = defineModel<Value | undefined>()
const { t, locale } = useI18n()
const invalid = ref(false)
const raw = computed(() => model.value?.text ?? model.value?.option ?? (model.value?.number === undefined ? '' : String(model.value.number)))

function change(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return
  try {
    model.value = attribute(props.field, input.value)
    invalid.value = false
    input.setCustomValidity('')
  } catch {
    invalid.value = true
    input.setCustomValidity(t('errors.invalid_input'))
  }
}
</script>

<template>
  <label class="field">
    <span class="field-label">{{ localName(field.names, locale) }}</span>
    <select
      v-if="field.kind === 'choice'"
      class="select"
      :value="raw"
      :aria-invalid="invalid"
      :required="!filter && field.required"
      :disabled="disabled"
      @change="change"
    >
      <option value="">{{ filter ? t('common.all') : t('common.notProvided') }}</option>
      <option
        v-for="option in field.options"
        :key="option.id"
        :value="option.id"
      >{{ localName(option.names, locale) }}</option>
    </select>
    <input
      v-else
      class="input"
      :value="raw"
      :aria-invalid="invalid"
      :type="field.kind === 'integer' ? 'number' : 'text'"
      :min="field.min"
      :max="field.max"
      :maxlength="field.max_length"
      :step="field.kind === 'integer' ? 1 : undefined"
      :required="!filter && field.required"
      :disabled="disabled"
      @input="change"
    >
  </label>
</template>
