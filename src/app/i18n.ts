import { computed, ref } from 'vue'
import { createI18n, useI18n } from 'vue-i18n'
import policy from '../../locale-policy.json'
import zhCN from '../locales/zh-CN.json'
import { createFormatters, pluralIndex } from '../shared/format'

export type Messages = typeof zhCN
export type Locale = keyof typeof policy.languages

export const defaultLocale = policy.default as Locale
export const timeZone = policy.default_time_zone
export const localeOptions = Object.entries(policy.languages).map(([value, entry]) => ({ value: value as Locale, label: entry.name, direction: entry.direction }))
export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && Object.hasOwn(policy.languages, value)

// Chinese ships with the application; other catalogues load when selected.
const catalogues = import.meta.glob<Messages>(['../locales/*.json', '!../locales/zh-CN.json'], { import: 'default' })
const storageKey = 'stuhelper.locale'

export const i18n = createI18n<[Messages], Locale, false>({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: false,
  missingWarn: true,
  fallbackWarn: true,
  messages: { [defaultLocale]: zhCN } as Record<Locale, Messages>,
  pluralRules: Object.fromEntries(localeOptions.map(({ value }) => [value, (count: number, choices: number) => pluralIndex(value, count, choices)])),
})

/** True once the selected catalogue is installed; the shell waits for it. */
export const localeReady = ref(false)

async function install(locale: Locale) {
  if (i18n.global.availableLocales.includes(locale)) return
  const load = catalogues[`../locales/${locale}.json`]
  if (!load) throw new Error(`Missing locale catalogue: ${locale}`)
  i18n.global.setLocaleMessage(locale, await load())
}

function apply(locale: Locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  document.documentElement.dir = policy.languages[locale].direction
}

/** Switch language after its messages are available, and remember the choice. */
export async function setLocale(locale: Locale) {
  await install(locale)
  apply(locale)
  try {
    localStorage.setItem(storageKey, locale)
  } catch {
    // Storage may be unavailable; the choice still applies to this page.
  }
}

/** Language order: explicit `lang` parameter, saved preference, default Chinese. */
export function initialLocale(): Locale {
  const requested = new URLSearchParams(location.search).get('lang')
  if (isLocale(requested)) return requested
  try {
    const saved = localStorage.getItem(storageKey)
    if (isLocale(saved)) return saved
  } catch {
    // Storage may be unavailable.
  }
  return defaultLocale
}

export async function prepareLocale() {
  const locale = initialLocale()
  try {
    await setLocale(locale)
  } catch {
    // A missing catalogue chunk (for example after a deployment) falls back to Chinese.
    apply(defaultLocale)
  }
  localeReady.value = true
}

/** Locale-aware formatters for the current language and the platform time zone. */
export function useFormat() {
  const { locale } = useI18n()
  return computed(() => createFormatters(locale.value, timeZone))
}
