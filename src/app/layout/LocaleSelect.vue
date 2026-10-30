<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isLocale, localeOptions, setLocale } from '../i18n'

const { t, locale } = useI18n()
async function change(event: Event) {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : ''
  if (isLocale(value)) await setLocale(value)
}
</script>

<template>
  <select
    class="select locale-select"
    :aria-label="t('language.label')"
    :value="locale"
    @change="change"
  >
    <option
      v-for="option in localeOptions"
      :key="option.value"
      :value="option.value"
      :lang="option.value"
    >
      {{ option.label }}
    </option>
  </select>
</template>

<style scoped>
.locale-select { width: auto; max-width: 8.5rem; min-height: 34px; padding-block: .2rem; font-size: .86rem; }
</style>
