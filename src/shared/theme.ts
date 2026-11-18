import { ref } from 'vue'

export type Theme = 'light' | 'dark'
export type ThemeChoice = Theme | 'system'

const storageKey = 'stuhelper.theme'
const system = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

function saved(): Theme | undefined {
  try {
    const value = localStorage.getItem(storageKey)
    return value === 'light' || value === 'dark' ? value : undefined
  } catch {
    // Storage may be unavailable; the page then follows the system appearance.
    return undefined
  }
}

/** The appearance currently shown. */
export const theme = ref<Theme>('light')
/** Explicit appearance choice, or 'system' when following OS preference. */
export const themeChoice = ref<ThemeChoice>('system')
/** Current OS color scheme so the toggle can cycle system -> opposite -> same -> system. */
export const systemTheme = ref<Theme>('light')

/**
 * Apply the saved appearance. Without a saved choice the root element carries no
 * data-theme, so the style sheet follows the system appearance on its own.
 */
export function installTheme() {
  const choice = saved()
  systemTheme.value = system()
  themeChoice.value = choice ?? 'system'
  if (choice) document.documentElement.dataset.theme = choice
  else delete document.documentElement.dataset.theme
  theme.value = choice ?? systemTheme.value
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    systemTheme.value = system()
    if (themeChoice.value === 'system') theme.value = systemTheme.value
  })
}

/** Switch appearance or return to following the system appearance. */
export function setThemeChoice(choice: ThemeChoice) {
  themeChoice.value = choice
  systemTheme.value = system()
  if (choice === 'system') {
    theme.value = systemTheme.value
    delete document.documentElement.dataset.theme
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Storage is optional.
    }
    return
  }
  theme.value = choice
  document.documentElement.dataset.theme = choice
  try {
    localStorage.setItem(storageKey, choice)
  } catch {
    // The choice still applies to this page.
  }
}

/** Switch appearance and remember the choice on this device. */
export function setTheme(value: Theme) {
  setThemeChoice(value)
}
