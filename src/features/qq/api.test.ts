import { expect, it } from 'vitest'
import { isolate } from '../../shared/format'
import { Http } from '../../shared/api/http'
import { maskQq, QqBindingApi } from './api'

it('masks the middle digits of a QQ number and keeps short values', () => {
  expect(maskQq('2840137956')).toBe('28******56')
  expect(maskQq('12345')).toBe('12*45')
  expect(maskQq('1234')).toBe('1234')
})

it('isolates left-to-right values so right-to-left text keeps their order', () => {
  expect(isolate('1****8')).toBe('⁦1****8⁩')
})

const part = { bound: true, revision: 1 }
const bound = { complete: false, onebot: { bound: false, revision: 0 }, connect: part, official: { bound: false, revision: 0 }, qq_number: '' }
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

it('resends the identical confirmation while the server reports processing', async () => {
  const sent: { key: string; body: string }[] = []
  const answers = [reply({ code: 'qq_binding_processing' }, 202), reply({ code: 'qq_binding_processing' }, 202), reply(bound)]
  const api = new QqBindingApi(new Http(async (_url, init) => {
    sent.push({ key: new Headers(init?.headers).get('Idempotency-Key') ?? '', body: String(init?.body) })
    return answers.shift()!
  }))
  const result = await api.confirmConnect({ state: 's1', code: 'c1' }, 'k1', async () => {})
  expect(result.connect.bound).toBe(true)
  expect(sent).toHaveLength(3)
  expect(new Set(sent.map((item) => `${item.key}|${item.body}`)).size).toBe(1)
})

it('reports a confirmation that needs a new authorization', async () => {
  const api = new QqBindingApi(new Http(async () => reply({ code: 'qq_binding_reauthorization_required' }, 400)))
  await expect(api.confirmConnect({ state: 's1', code: 'c1' }, 'k1', async () => {})).rejects.toMatchObject({ code: 'qq_binding_reauthorization_required' })
})

it('stops after a bounded number of processing answers with an uncertain result', async () => {
  let calls = 0
  const api = new QqBindingApi(new Http(async () => {
    calls++
    return reply({ code: 'qq_binding_processing' }, 202)
  }))
  await expect(api.confirmConnect({ state: 's1', code: 'c1' }, 'k1', async () => {})).rejects.toMatchObject({ code: 'processing' })
  expect(calls).toBe(12)
})
