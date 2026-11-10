import { ApiError, isUncertain } from './errors'

/**
 * Copy a JSON-compatible value. Vue wraps nested form state in proxies that
 * structuredClone rejects, and a retry must not see later edits.
 */
export function snapshot<T>(value: T): T {
  const copy = (input: unknown, depth: number): unknown => {
    if (depth > 24) throw new ApiError('invalid_input')
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new ApiError('invalid_input')
      return input
    }
    if (Array.isArray(input)) {
      if (input.length > 1000) throw new ApiError('invalid_input')
      return input.map((item) => copy(item, depth + 1))
    }
    if (typeof input === 'object') {
      const prototype = Object.getPrototypeOf(input)
      if (prototype !== Object.prototype && prototype !== null) throw new ApiError('invalid_input')
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, item]) => item !== undefined)
          .map(([key, item]) => [key, copy(item, depth + 1)]),
      )
    }
    throw new ApiError('invalid_input')
  }
  // Every supported JSON value keeps its shape, so the copy has the input's type.
  return copy(value, 0) as T
}

interface Pending {
  signature: string
  body: unknown
  key: string
  send: (body: unknown, key: string) => Promise<unknown>
}

/**
 * One write whose outcome may be unknown. After a lost response the original
 * body and idempotency key are kept, and only that request may be sent again.
 * A known success or rejection releases it, so the next write gets a new key.
 */
export class Mutation {
  private pending?: Pending

  get uncertain() {
    return this.pending !== undefined
  }

  /**
   * Send a new write. `signature` names the target (for example method and
   * path); a different write while an outcome is unknown is refused.
   */
  async run<B, R>(signature: string, body: B, send: (body: B, key: string) => Promise<R>): Promise<R> {
    if (this.pending && this.pending.signature !== signature) throw new ApiError('retry_required')
    // Typed callers pair each body with its own sender.
    this.pending ??= { signature, body: snapshot(body), key: crypto.randomUUID(), send: send as Pending['send'] }
    return this.settle() as Promise<R>
  }

  /** Resend the write whose outcome is unknown, with its original body and key. */
  async retry(): Promise<unknown> {
    if (!this.pending) return undefined
    return this.settle()
  }

  private async settle() {
    const pending = this.pending
    if (!pending) throw new ApiError('retry_required')
    try {
      const result = await pending.send(pending.body, pending.key)
      if (this.pending === pending) this.pending = undefined
      return result
    } catch (error) {
      if (!isUncertain(error) && this.pending === pending) this.pending = undefined
      throw error
    }
  }
}
