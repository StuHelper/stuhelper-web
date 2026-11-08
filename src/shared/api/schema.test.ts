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

describe('schema combinators', () => {
  const schemas = {
    A: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['a'] }, n: { type: 'integer' } } },
    B: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['b'] } } },
  }
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` })
  it('requires every allOf part and exactly one oneOf part', () => {
    const shape = { type: 'object', properties: { kind: { type: 'string' }, n: { type: 'integer' } }, allOf: [{ oneOf: [ref('A'), ref('B')] }] }
    expect(validates({ kind: 'a', n: 1 }, shape, schemas)).toBe(true)
    expect(validates({ kind: 'b' }, shape, schemas)).toBe(true)
    expect(validates({ kind: 'c' }, shape, schemas)).toBe(false)
    expect(validates({ kind: 'a', n: 'x' }, shape, schemas)).toBe(false)
  })
  it('rejects a value matching more than one oneOf part and accepts anyOf with one match', () => {
    const loose = { type: 'object' }
    expect(validates({ kind: 'a' }, { oneOf: [ref('A'), loose] }, schemas)).toBe(false)
    expect(validates({ kind: 'a' }, { anyOf: [ref('A'), ref('B')] }, schemas)).toBe(true)
  })
})
