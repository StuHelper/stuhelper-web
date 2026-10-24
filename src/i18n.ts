import { createI18n } from 'vue-i18n'
import policy from '../locale-policy.json'
import type zhCN from './locales/zh-CN.json'
import { pluralIndex } from './formatting'

export type Locale = keyof typeof policy.languages
export const localeOptions = Object.entries(policy.languages).map(([value, entry]) => ({ value: value as Locale, label: entry.name }))
export const isLocale = (value: unknown): value is Locale => typeof value === 'string' && Object.hasOwn(policy.languages, value)
const resources = import.meta.glob<typeof zhCN>('./locales/*.json', { eager: true, import: 'default' })
const messages = Object.fromEntries(localeOptions.map(({ value }) => {
  const resource = resources[`./locales/${value}.json`]
  if (!resource) throw new Error(`Missing locale catalogue: ${value}`)
  return [value, resource]
})) as Record<Locale, typeof zhCN>
function byLocale<T>(create: (locale: Locale) => T): Record<Locale, T> {
  return Object.fromEntries(localeOptions.map(({ value }) => [value, create(value)])) as Record<Locale, T>
}
function initialLocale(): Locale {
  const requested = new URLSearchParams(location.search).get('lang')
  if (isLocale(requested)) return requested
  try {
    const saved = localStorage.getItem('stuhelper.locale')
    if (isLocale(saved)) return saved
  } catch { /* Browser storage can be unavailable. */ }
  return policy.default as Locale
}
export const i18n = createI18n<[typeof zhCN], Locale, false>({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: false,
  messages,
  pluralRules: Object.fromEntries(localeOptions.map(({ value }) => [value, (count: number, choices: number) => pluralIndex(value, count, choices)])),
  numberFormats: byLocale(() => ({ decimal: { style: 'decimal' }, percent: { style: 'percent' } } as const)),
  datetimeFormats: byLocale(() => ({ date: { year: 'numeric', month: 'short', day: 'numeric', calendar: 'gregory', timeZone: policy.default_time_zone }, dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', calendar: 'gregory', timeZone: policy.default_time_zone } } as const)),
})
export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  document.documentElement.dir = policy.languages[locale].direction
  document.title = i18n.global.t('brand.home')
  try { localStorage.setItem('stuhelper.locale', locale) } catch { /* Optional persistence. */ }
}
setLocale(i18n.global.locale.value)
