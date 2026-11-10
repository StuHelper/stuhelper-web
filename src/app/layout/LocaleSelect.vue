<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { Globe } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { isLocale, localeOptions, setLocale } from '../i18n'

const { t, locale } = useI18n()
async function change(value: string) {
  if (isLocale(value)) await setLocale(value)
}
</script>

<template>
  <span class="locale">
    <Globe aria-hidden="true" />
    <AppSelect
      class="locale-select"
      :aria-label="t('language.label')"
      :model-value="locale"
      @update:model-value="change"
    >
      <option
        v-for="option in localeOptions"
        :key="option.value"
        :value="option.value"
        :lang="option.value"
      >
        {{ option.label }}
      </option>
    </AppSelect>
  </span>
</template>

<style scoped>
.locale { position: relative; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--label-2); transition: background-color .2s, color .2s; }
.locale:hover { background: var(--fill); color: var(--label); }
.locale:focus-within { outline: 3px solid color-mix(in srgb, var(--accent-fill) 55%, transparent); }
.locale svg { width: 19px; height: 19px; }
.locale-select { position: absolute; inset: 0; opacity: 0; }
</style>
