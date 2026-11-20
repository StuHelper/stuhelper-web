import { describe, expect, it } from 'vitest'
import { createLimiter } from './limit'

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r }); return { promise, resolve } }

describe('createLimiter', () => {
  it('runs no more than the limit at once and starts waiting tasks in order', async () => {
    const run = createLimiter(2), gates = [deferred(), deferred(), deferred()], started: number[] = []
    const all = gates.map((gate, i) => run(new AbortController().signal, async () => { started.push(i); await gate.promise; return i }))
    await Promise.resolve()
    expect(started).toEqual([0, 1])
    gates[0]!.resolve()
    await all[0]
    await Promise.resolve()
    expect(started).toEqual([0, 1, 2])
    gates[1]!.resolve(); gates[2]!.resolve()
    expect(await Promise.all(all)).toEqual([0, 1, 2])
  })

  it('drops a waiting task when its signal aborts, without running it', async () => {
    const run = createLimiter(1), gate = deferred(), controller = new AbortController()
    let ran = false
    const first = run(new AbortController().signal, () => gate.promise)
    const second = run(controller.signal, async () => { ran = true })
    controller.abort()
    await expect(second).rejects.toBeDefined()
    gate.resolve(); await first
    expect(ran).toBe(false)
  })
})
