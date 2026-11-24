import type { Conditions, Policy } from '../../api/contribution';

import { formatQuotaInput, parseQuotaBytes } from '../../api/capacity';

export function parseGB(raw: string): number | null {
  return raw === raw.trim() ? parseQuotaBytes(raw, 'GB') ?? null : null;
}

export function gbInput(bytes: number): string {
  return formatQuotaInput(bytes, 'GB');
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
