import { expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import en from '../locales/en-US.json'
import ar from '../locales/ar-EG.json'
import ru from '../locales/ru-RU.json'
import { pluralIndex } from '../shared/format'

it('uses singular, dual and plural forms with a separately formatted number', () => {
  const i18n = createI18n({
    legacy: false, locale: 'en-US', messages: { 'en-US': en, 'ar-EG': ar, 'ru-RU': ru },
    pluralRules: { 'en-US': (n, choices) => pluralIndex('en-US', n, choices), 'ar-EG': (n, choices) => pluralIndex('ar-EG', n, choices), 'ru-RU': (n, choices) => pluralIndex('ru-RU', n, choices) },
  })
  expect(i18n.global.t('membership.days', { count: '1' }, 1)).toBe('1 day')
  expect(i18n.global.t('membership.days', { count: '2' }, 2)).toBe('2 days')
  i18n.global.locale.value = 'ar-EG'
  const arabicCases = [
    [0, '٠', '٠ يوم'], [1, '١', 'يوم واحد (١)'], [2, '٢', 'يومان (٢)'],
    [3, '٣', '٣ أيام'], [11, '١١', '١١ يومًا'], [100, '١٠٠', '١٠٠ يوم'],
  ] as const
  for (const [n, count, expected] of arabicCases) {
    expect(i18n.global.t('membership.days', { count }, n)).toBe(expected)
  }
  i18n.global.locale.value = 'ru-RU'
  for (const [n, expected] of [[1, '1 день'], [3, '3 дня'], [5, '5 дней'], [1.5, '1,5 дня']] as const) {
    const count = new Intl.NumberFormat('ru-RU').format(n)
    expect(i18n.global.t('membership.days', { count }, n)).toBe(expected)
  }
})
