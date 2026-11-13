<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { setTheme, theme } from '../../shared/theme'

const { t } = useI18n()

// The new appearance spreads from the button. Browsers without the View
// Transitions API, and people who asked for reduced motion, switch directly.
function toggle(event: MouseEvent) {
  const next = theme.value === 'dark' ? 'light' : 'dark'
  const root = document.documentElement
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTheme(next)
    return
  }
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  root.style.setProperty('--theme-x', `${box.left + box.width / 2}px`)
  root.style.setProperty('--theme-y', `${box.top + box.height / 2}px`)
  root.classList.add('theme-switching')
  const transition = document.startViewTransition(async () => {
    setTheme(next)
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
    :aria-label="t(theme === 'dark' ? 'shell.themeLight' : 'shell.themeDark')"
    @click="toggle"
  >
    <Transition
      name="theme-icon"
      mode="out-in"
    >
      <Sun
        v-if="theme === 'dark'"
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
