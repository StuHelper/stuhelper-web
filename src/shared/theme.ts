import { ref } from 'vue'

export type Theme = 'light' | 'dark'

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

/**
 * Apply the saved appearance. Without a saved choice the root element carries no
 * data-theme, so the style sheet follows the system appearance on its own.
 */
export function installTheme() {
  const choice = saved()
  if (choice) document.documentElement.dataset.theme = choice
  theme.value = choice ?? system()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!saved()) theme.value = system()
  })
}

/** Switch appearance and remember the choice on this device. */
export function setTheme(value: Theme) {
  theme.value = value
  document.documentElement.dataset.theme = value
  try {
    localStorage.setItem(storageKey, value)
  } catch {
    // The choice still applies to this page.
  }
}
