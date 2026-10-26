import type { Conditions, Policy } from './api/contribution';

// Decimal GB input is converted exactly before checking the JSON safe-integer range.
export function parseGB(raw: string): number | null {
  if (!/^\d{1,16}(?:\.\d{1,9})?$/.test(raw)) return null;
  const [whole = '0', fraction = ''] = raw.split('.');
  const bytes = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  return bytes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bytes) : null;
}
export function gbInput(bytes: number): string { return (bytes / 1_000_000_000).toFixed(9).replace(/\.?0+$/, ''); }
export function localDateInput(instant: number): string {
  const date = new Date(instant);
  return new Date(instant - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function conditions(limit: string, reserve: string, until: string, policy: Pick<Policy, 'min_bytes' | 'max_bytes' | 'min_term_seconds' | 'max_term_seconds'>, now: number, configureUntil?: string): Conditions | null {
  const limit_bytes = parseGB(limit), personal_reserve = parseGB(reserve);
  const instant = configureUntil ? Date.parse(configureUntil) : new Date(until).getTime();
  if (limit_bytes === null || personal_reserve === null || personal_reserve > 2 ** 46 || limit_bytes < policy.min_bytes || limit_bytes > policy.max_bytes || !Number.isFinite(instant)) return null;
  if (!configureUntil && (instant < now + policy.min_term_seconds * 1000 || instant > now + policy.max_term_seconds * 1000)) return null;
  return { limit_bytes, personal_reserve, until: new Date(instant).toISOString() };
}
