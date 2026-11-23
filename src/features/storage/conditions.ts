import type { Conditions, Policy } from '../../api/contribution';

// 1 GB here is 1024³ bytes, the unit BHpan and most operating systems use for drive space, so a
// "500 GB" drive reads as 500 on this page. Ten decimal places resolve below one byte, which keeps
// every byte count expressible; input is rounded to the nearest byte with exact integer arithmetic.
const GB = 1n << 30n
const scale = 10n ** 10n
export function parseGB(raw: string): number | null {
  if (!/^\d{1,16}(?:\.\d{1,10})?$/.test(raw)) return null;
  const [whole = '0', fraction = ''] = raw.split('.');
  const scaled = BigInt(whole) * scale + BigInt(fraction.padEnd(10, '0'));
  const bytes = (scaled * GB + scale / 2n) / scale;
  if (scaled > 0n && bytes === 0n) return null;
  return bytes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bytes) : null;
}
/** The shortest GB text that parses back to exactly these bytes. */
export function gbInput(bytes: number): string {
  const exact = BigInt(bytes);
  for (let digits = 0; ; digits++) {
    const unit = 10n ** BigInt(digits);
    const rounded = (exact * unit + GB / 2n) / GB;
    const fraction = (rounded % unit).toString().padStart(digits, '0');
    const text = (rounded / unit).toString() + (digits ? '.' + fraction : '');
    if (digits === 10 || parseGB(text) === bytes) return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  }
}
export function localDateInput(instant: number): string {
  const date = new Date(instant);
  return new Date(instant - date.getTimezoneOffset() * 60_000).toISOString().replace(/Z$/, '');
}
export function conditions(limit: string, reserve: string, until: string, policy: Pick<Policy, 'min_bytes' | 'max_bytes' | 'min_term_seconds' | 'max_term_seconds'>, now: number, configureUntil?: string): Conditions | null {
  const limit_bytes = parseGB(limit), personal_reserve = parseGB(reserve);
  const instant = configureUntil ? Date.parse(configureUntil) : new Date(until).getTime();
  if (limit_bytes === null || personal_reserve === null || personal_reserve > 2 ** 46 || limit_bytes < policy.min_bytes || limit_bytes > policy.max_bytes || !Number.isFinite(instant)) return null;
  if (!configureUntil && (instant < now + policy.min_term_seconds * 1000 || instant > now + policy.max_term_seconds * 1000)) return null;
  return { limit_bytes, personal_reserve, until: new Date(instant).toISOString() };
}
