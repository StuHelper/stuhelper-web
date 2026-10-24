/** Presentation helpers. API values keep their canonical currency and UTC instant. */
const pluralOrder: Intl.LDMLPluralRule[] = ['zero', 'one', 'two', 'few', 'many', 'other'];
export function pluralCategories(locale: string, type: Intl.PluralRuleType = 'cardinal') {
  const categories = new Intl.PluralRules(locale, { type }).resolvedOptions().pluralCategories;
  return pluralOrder.filter(category => categories.includes(category));
}
export function pluralIndex(locale: string, count: number, choices: number, type: Intl.PluralRuleType = 'cardinal') {
  const categories = pluralCategories(locale, type);
  if (choices !== categories.length) throw new RangeError('Plural message does not cover the locale categories');
  return categories.indexOf(new Intl.PluralRules(locale, { type }).select(count));
}
function instant(value: Date | number | string) {
  if (typeof value === 'string' && !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new RangeError('An instant requires an explicit UTC offset');
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid instant');
  return date;
}
export function createFormatters(locale: string, timeZone = 'Asia/Shanghai') {
  // Validate the selected time zone before rendering any temporal field.
  new Intl.DateTimeFormat(locale, { timeZone }).format(0);
  return {
    number: (value: number | bigint, options: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(locale, options).format(value),
    percent: (value: number, options: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(locale, { ...options, style: 'percent' }).format(value),
    currency(value: string | number | bigint, currency: string, options: Intl.NumberFormatOptions = {}) {
      if (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value)) throw new RangeError('Currency requires a canonical decimal value');
      if (typeof value === 'number' && !Number.isFinite(value)) throw new RangeError('Invalid currency amount');
      // ECMA-402 preserves the exact mathematical value of decimal strings.
      const format = new Intl.NumberFormat(locale, { ...options, style: 'currency', currency }).format as (amount: string | number | bigint) => string;
      return format(value);
    },
    date: (value: Date | number | string, options: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat(locale, { ...(Object.keys(options).length ? {} : { dateStyle: 'medium' as const }), calendar: 'gregory', ...options, timeZone }).format(instant(value)),
    dateTime: (value: Date | number | string, options: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat(locale, { ...(Object.keys(options).length ? {} : { dateStyle: 'medium' as const, timeStyle: 'short' as const }), calendar: 'gregory', ...options, timeZone }).format(instant(value)),
    dateRange: (start: Date | number | string, end: Date | number | string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', calendar: 'gregory', timeZone }).formatRange(instant(start), instant(end)),
    calendarDate(value: string) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('Calendar dates use YYYY-MM-DD');
      const date = new Date(`${value}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RangeError('Invalid calendar date');
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', calendar: 'gregory', timeZone: 'UTC' }).format(date);
    },
    relative: (value: number, unit: Intl.RelativeTimeFormatUnit) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit),
    list: (values: string[]) => new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(values),
    compare: new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }).compare,
  };
}
