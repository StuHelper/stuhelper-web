import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { ApiError } from './errors'
import { Mutation, snapshot } from './mutation'

describe('idempotent writes', () => {
  it('resends the frozen body with the original key after an unknown outcome', async () => {
    const sent: { body: unknown; key: string }[] = []
    const mutation = new Mutation()
    const form = reactive({ title: 'Original', nested: { ratings: [1, 2, 3, 4, 5] } })
    const send = async (body: unknown, key: string) => {
      sent.push({ body: structuredClone(body), key })
      if (sent.length === 1) throw new ApiError('network', true)
      return 'ok'
    }
    await expect(mutation.run('create', form, send)).rejects.toMatchObject({ uncertain: true })
    form.title = 'Changed locally'
    form.nested.ratings[0] = 5
    expect(mutation.uncertain).toBe(true)
    await expect(mutation.run('other', form, send)).rejects.toMatchObject({ code: 'retry_required' })
    await expect(mutation.run('create', form, send)).resolves.toBe('ok')
    expect(sent[1]).toEqual(sent[0])
    expect(mutation.uncertain).toBe(false)
  })

  it('starts a new key after a known rejection', async () => {
    const keys: string[] = []
    const mutation = new Mutation()
    await expect(mutation.run('a', {}, async (_body, key) => { keys.push(key); throw new ApiError('conflict') })).rejects.toMatchObject({ code: 'conflict' })
    await mutation.run('a', {}, async (_body, key) => { keys.push(key); return 1 })
    expect(keys[0]).not.toBe(keys[1])
  })

  it('retries the pending write explicitly', async () => {
    let calls = 0
    const mutation = new Mutation()
    await expect(mutation.run('a', { v: 1 }, async (body) => { calls++; if (calls === 1) throw new ApiError('timeout', true); return body })).rejects.toBeInstanceOf(ApiError)
    await expect(mutation.retry()).resolves.toEqual({ v: 1 })
    await expect(mutation.retry()).resolves.toBeUndefined()
  })

  it('copies only JSON values and drops undefined fields', () => {
    expect(snapshot(reactive({ x: { value: 3 }, optional: undefined }))).toEqual({ x: { value: 3 } })
    expect(() => snapshot({ when: new Date() })).toThrow()
    expect(() => snapshot({ n: Number.NaN })).toThrow()
  })
})
