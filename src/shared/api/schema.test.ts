import { describe, expect, it } from 'vitest'
import { validates } from './schema'

const schemas = {
  Item: { type: 'object', required: ['id', 'count'], additionalProperties: false, properties: { id: { type: 'string', maxLength: 3 }, count: { type: 'integer', minimum: 0 }, at: { type: 'string', format: 'date-time' }, note: { type: 'string', nullable: true } } },
}

describe('contract validation', () => {
  it('accepts a matching object', () => {
    expect(validates({ id: 'abc', count: 1, at: '2026-10-30T00:00:00+08:00', note: null }, { $ref: '#/components/schemas/Item' }, schemas)).toBe(true)
  })
  it.each([
    ['missing field', { id: 'a' }],
    ['extra field', { id: 'a', count: 1, extra: true }],
    ['too long', { id: 'abcd', count: 1 }],
    ['negative', { id: 'a', count: -1 }],
    ['unsafe integer', { id: 'a', count: 2 ** 60 }],
    ['instant without offset', { id: 'a', count: 1, at: '2026-10-30T00:00:00' }],
    ['null without nullable', { id: null, count: 1 }],
  ])('rejects %s', (_name, value) => {
    expect(validates(value, { $ref: '#/components/schemas/Item' }, schemas)).toBe(false)
  })
  it('checks array bounds', () => {
    expect(validates([1, 2], { type: 'array', minItems: 5, items: { type: 'integer' } }, {})).toBe(false)
  })
})
