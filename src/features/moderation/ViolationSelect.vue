<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import AppSelect from '../../shared/ui/AppSelect.vue'
import { violationCategories, type ViolationCategory } from './categories'

// The fixed violation categories shared by review reports and resource complaints.
// The list is long, so AppSelect shows a search box; the chosen category's
// description is shown below to help pick the right one.
const props = withDefaults(defineProps<{ disabled?: boolean; exclude?: readonly ViolationCategory[] }>(), { disabled: false, exclude: () => [] })
const category = defineModel<ViolationCategory | ''>({ required: true })
const { t } = useI18n()
const id = useId()
const options = computed(() => violationCategories.filter((code) => !props.exclude.includes(code)))
</script>

<template>
  <div class="field">
    <!-- Same pattern as the other selects: the wrapping label names the trigger. -->
    <label class="field">
      <span class="field-label">{{ t('violation.label') }}</span>
      <AppSelect
        v-model="category"
        class="select"
        required
        :disabled="disabled"
        :aria-describedby="category ? `${id}-hint` : undefined"
      >
        <option
          disabled
          value=""
        >
          {{ t('common.choose') }}
        </option>
        <option
          v-for="code in options"
          :key="code"
          :value="code"
        >
          {{ t(`violation.categories.${code}.name`) }}
        </option>
      </AppSelect>
    </label>
    <span
      v-if="category"
      :id="`${id}-hint`"
      class="field-hint"
    >{{ t(`violation.categories.${category}.hint`) }}</span>
  </div>
</template>
