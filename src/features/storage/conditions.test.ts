import { describe, expect, it } from 'vitest';
import example from '../../../contracts/contribution.example.json';
import { conditions, gbInput, parseGB } from './conditions';
describe('contribution conditions', () => {
  it('converts fractional GB exactly and rejects unsafe or ambiguous input', () => {
    expect(parseGB('500')).toBe(500 * 1024 ** 3); expect(parseGB('1.5')).toBe(1_610_612_736);
    expect(parseGB('0.000000001')).toBe(1); expect(gbInput(500 * 1024 ** 3)).toBe('500');
    expect(gbInput(1_610_612_736)).toBe('1.5'); expect(gbInput(0)).toBe('0');
    for (const bytes of [1, 2, 1023, 1_000_000_000, 10 * 1024 ** 3 + 1]) expect(parseGB(gbInput(bytes))).toBe(bytes);
    for (const value of ['-1', '1e9', '1,5', 'Infinity', '', '0.00000000001', '0.0000000001', '9999999999999999']) expect(parseGB(value)).toBeNull();
  });
  it('bounds new terms and preserves the original timestamp when adjusting quota', () => {
    const now = Date.parse('2029-12-01T00:00:00Z');
    expect(conditions('10', '1', '2029-11-01T00:00:00', example.policy, now)).toBeNull();
    expect(conditions('0.1', '1', '2030-01-01T00:00:00', example.policy, now)).toBeNull();
    expect(conditions('10', '1', '', example.policy, now, '2030-01-01T00:00:00Z')?.until).toBe('2030-01-01T00:00:00.000Z');
  });
});

it('round trips the largest supported GB value to the exact byte', () => {
  for (const bytes of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1]) expect(parseGB(gbInput(bytes))).toBe(bytes)
})
