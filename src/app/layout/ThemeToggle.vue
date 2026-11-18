<script setup lang="ts">
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { setThemeChoice, systemTheme, theme, themeChoice, type ThemeChoice } from '../../shared/theme'

const { t } = useI18n()

const nextChoice = computed<ThemeChoice>(() => {
  const opposite: 'light' | 'dark' = systemTheme.value === 'dark' ? 'light' : 'dark'
  if (themeChoice.value === 'system') return opposite
  if (themeChoice.value === opposite) return systemTheme.value
  return 'system'
})
const nextLabel = computed(() => (
  nextChoice.value === 'system'
    ? t('shell.themeSystem')
    : t(nextChoice.value === 'dark' ? 'shell.themeDark' : 'shell.themeLight')
))

// The new appearance spreads from the button. Browsers without the View
// Transitions API, and people who asked for reduced motion, switch directly.
function toggle(event: MouseEvent) {
  const next = nextChoice.value
  const willChangeVisual = (next === 'system' ? systemTheme.value : next) !== theme.value
  const root = document.documentElement
  if (!willChangeVisual || !document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setThemeChoice(next)
    return
  }
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  root.style.setProperty('--theme-x', `${box.left + box.width / 2}px`)
  root.style.setProperty('--theme-y', `${box.top + box.height / 2}px`)
  root.classList.add('theme-switching')
  const transition = document.startViewTransition(async () => {
    setThemeChoice(next)
    await nextTick()
  })
  // A skipped transition still applies the appearance, so its rejection is not a failure.
  transition.ready.catch(() => undefined)
  transition.finished.catch(() => undefined).finally(() => root.classList.remove('theme-switching'))
}
</script>

<template>
  <button
    class="btn btn-icon theme"
    type="button"
    :aria-label="nextLabel"
    :title="nextLabel"
    @click="toggle"
  >
    <Transition
      name="theme-icon"
      mode="out-in"
    >
      <Monitor
        v-if="nextChoice === 'system'"
        aria-hidden="true"
      />
      <Sun
        v-else-if="theme === 'dark'"
        aria-hidden="true"
      />
      <Moon
        v-else
        aria-hidden="true"
      />
    </Transition>
  </button>
</template>

<style scoped>
.theme { background: transparent; color: var(--label-2); }
.theme:hover { background: var(--fill); color: var(--label); }
.theme svg { width: 19px; height: 19px; }
.theme-icon-enter-active { transition: transform .4s var(--spring), opacity .2s; }
.theme-icon-leave-active { transition: transform .15s ease-in, opacity .15s; }
.theme-icon-enter-from { opacity: 0; transform: rotate(-90deg) scale(.5); }
.theme-icon-leave-to { opacity: 0; transform: rotate(90deg) scale(.5); }
</style>
