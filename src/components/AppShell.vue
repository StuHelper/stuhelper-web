<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale, localeOptions, type Locale } from '../i18n'
const { t, locale } = useI18n()
function changeLocale(event: Event) { setLocale((event.target as HTMLSelectElement).value as Locale) }
</script>

<template>
  <a
    class="skip-link"
    href="#main-content"
  >{{ t('shell.skip') }}</a>
  <div class="app-shell ">
    <header class="app-header">
      <RouterLink
        class="brand"
        to="/"
        :aria-label="t('brand.home')"
      >
        <img
          class="brand-mark"
          src="/brand.png"
          alt=""
          width="44"
          height="44"
        >
        <span>{{ t('brand.name') }}<span class="brand-context">{{ t('brand.context') }}</span></span>
      </RouterLink>
      <div class="header-controls">
        <nav
          class="academic-nav"
          :aria-label="t('academic.community')"
        >
          <RouterLink to="/courses">
            {{ t('academic.courses') }}
          </RouterLink><RouterLink to="/teachers">
            {{ t('academic.teachers') }}
          </RouterLink><RouterLink to="/community/me">
            {{ t('academic.myCommunity') }}
          </RouterLink>
        </nav>
        <span class="stage-label">{{ t('shell.preview') }}</span><select
          :aria-label="t('language.label')"
          :value="locale"
          @change="changeLocale"
        >
          <option
            v-for="option in localeOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
    </header>
    <main
      id="main-content"
      class="main-content"
      tabindex="-1"
    >
      <slot />
    </main>
    <footer class="app-footer">
      <span>{{ t('brand.name') }}</span>
      <span>{{ t('shell.footer') }}</span>
    </footer>
  </div>
</template>

<style scoped>
.header-controls { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; justify-content: end; }
.header-controls select { min-height: 36px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 4px; }
.app-shell { min-height: 100dvh; display: flex; flex-direction: column; }
.app-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem clamp(1.25rem, 5vw, 5rem); border-bottom: 1px solid var(--border); background: var(--surface); }
.brand { display: inline-flex; align-items: center; gap: .7rem; color: var(--text); text-decoration: none; font-size: 1.15rem; font-weight: 700; letter-spacing: -.025em; }
.brand-mark { object-fit: contain; }
.brand-context { display: block; font-size: .7rem; letter-spacing: .1em; color: var(--muted); font-weight: 500; margin-top: .15rem; }
.stage-label { color: var(--muted); font-size: .8rem; border: 1px solid var(--border); padding: .3rem .65rem; border-radius: 4px; }
.main-content { flex: 1; width: min(100% - 3rem, 68rem); margin: 0 auto; padding: clamp(3rem, 9vh, 7rem) 0; }
.app-footer { display: flex; justify-content: space-between; gap: 1rem; padding: 1.25rem clamp(1.25rem, 5vw, 5rem); color: var(--muted); font-size: .75rem; border-top: 1px solid var(--border); }
.admin-shell { --accent: #455d58; --accent-soft: #e8efec; }
</style>
