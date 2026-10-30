<script setup lang="ts">
import { Globe } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { isLocale, localeOptions, setLocale } from '../i18n'

// A native select under a globe icon, so phones open the system picker.
const { t, locale } = useI18n()
async function change(event: Event) {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : ''
  if (isLocale(value)) await setLocale(value)
}
</script>

<template>
  <span class="locale">
    <Globe aria-hidden="true" />
    <select
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
  </span>
</template>

<style scoped>
.locale { position: relative; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: var(--label-2); transition: background-color .2s, color .2s; }
.locale:hover { background: var(--fill); color: var(--label); }
.locale:focus-within { outline: 3px solid color-mix(in srgb, var(--accent-fill) 55%, transparent); }
.locale svg { width: 19px; height: 19px; }
.locale select { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; opacity: 0; font-size: 1rem; cursor: pointer; }
</style>
