import { describe, expect, it } from 'vitest';
import { createFormatters, pluralCategories, pluralIndex } from './formatting';
const locales = ['zh-CN', 'en-US', 'fr-FR', 'ru-RU', 'ja-JP', 'ko-KR', 'es-ES', 'ar-EG'];
describe('localized presentation', () => {
  it.each(locales)('formats numbers, money, time, relative time and lists in %s', (locale) => {
    const format = createFormatters(locale, 'Asia/Shanghai');
    expect(format.number(1234.5)).not.toBe('');
    expect(format.percent(0.25)).not.toBe('');
    expect(format.currency('12.50', 'CNY')).not.toBe('');
    expect(format.dateTime('2026-10-24T00:00:00Z')).not.toBe('');
    expect(format.relative(-1, 'day')).not.toBe('');
    expect(format.list(['A', 'B'])).toContain('A');
    expect(format.compare('2', '10')).toBeLessThan(0);
    expect(format.calendarDate('2026-10-24')).not.toBe('');
  });
  it('uses currency precision and preserves decimal strings beyond safe integers', () => {
    const format = createFormatters('en-US');
    expect(format.currency('9007199254740993.12', 'USD')).toBe('$9,007,199,254,740,993.12');
    expect(format.currency('12.5', 'JPY')).toBe('¥13');
    expect(format.currency('12.5', 'KWD')).toContain('12.500');
    expect(format.percent(0.25)).toBe('25%');
    expect(() => format.currency('12,50', 'EUR')).toThrow();
  });
  it('keeps instants and calendar dates distinct across time zones', () => {
    const west = createFormatters('en-US', 'America/Los_Angeles');
    const east = createFormatters('en-US', 'Asia/Shanghai');
    expect(west.date('2026-10-24T00:00:00Z')).toContain('23');
    expect(east.date('2026-10-24T00:00:00Z')).toContain('24');
    expect(west.calendarDate('2026-10-24')).toBe(east.calendarDate('2026-10-24'));
    expect(() => west.calendarDate('2026-02-30')).toThrow();
    expect(() => west.dateTime('2026-10-24T00:00:00')).toThrow();
    expect(() => createFormatters('en-US', 'Invalid/Zone')).toThrow();
  });
  it('applies Russian, Arabic and French CLDR plural rules', () => {
    expect(pluralCategories('ru-RU')).toEqual(['one', 'few', 'many', 'other']);
    expect([0, 1, 2, 5, 21, 1.5].map(count => pluralIndex('ru-RU', count, 4))).toEqual([2, 0, 1, 2, 0, 3]);
    expect([0, 1, 2, 3, 11, 100].map(count => pluralIndex('ar-EG', count, 6))).toEqual([0, 1, 2, 3, 4, 5]);
    expect([0, 1, 2, 1000000].map(count => pluralIndex('fr-FR', count, 3))).toEqual([0, 0, 2, 1]);
    expect(() => pluralIndex('ar-EG', 3, 2)).toThrow();
    expect([21, 22, 23, 24].map(count => pluralIndex('en-US', count, 4, 'ordinal'))).toEqual([0, 1, 2, 3]);
  });
});
