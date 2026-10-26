import { describe, expect, it } from 'vitest';
import example from '../contracts/contribution.example.json';
import { conditions, gbInput, parseGB } from './contributionForm';
describe('contribution conditions', () => {
  it('converts fractional GB exactly and rejects unsafe or ambiguous input', () => {
    expect(parseGB('0.000000001')).toBe(1); expect(parseGB('10.000000001')).toBe(10000000001);
    expect(gbInput(10000000001)).toBe('10.000000001'); expect(gbInput(0)).toBe('0');
    for (const value of ['-1', '1e9', '1,5', 'Infinity', '', '0.0000000001', '9999999999999999']) expect(parseGB(value)).toBeNull();
  });
  it('bounds new terms and preserves the original timestamp when adjusting quota', () => {
    const now = Date.parse('2029-12-01T00:00:00Z');
    expect(conditions('10', '1', '2029-11-01T00:00:00', example.policy, now)).toBeNull();
    expect(conditions('0.1', '1', '2030-01-01T00:00:00', example.policy, now)).toBeNull();
    expect(conditions('10', '1', '', example.policy, now, '2030-01-01T00:00:00Z')?.until).toBe('2030-01-01T00:00:00.000Z');
  });
});
