import { expect, it } from 'vitest'
import { isolate } from '../../shared/format'
import { maskQq } from './api'

it('masks the middle digits of a QQ number and keeps short values', () => {
  expect(maskQq('2840137956')).toBe('28******56')
  expect(maskQq('12345')).toBe('12*45')
  expect(maskQq('1234')).toBe('1234')
})

it('isolates left-to-right values so right-to-left text keeps their order', () => {
  expect(isolate('1****8')).toBe('⁦1****8⁩')
})
