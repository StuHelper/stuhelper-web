// Runs at most `size` tasks at a time; later ones wait their turn in order. A task whose signal
// is aborted while waiting is dropped without running, so cancelled work frees its place.
export function createLimiter(size: number) {
  let running = 0
  const waiting: Array<() => void> = []
  const next = () => {
    running--
    waiting.shift()?.()
  }
  return async function run<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    if (running >= size) {
      await new Promise<void>((resolve, reject) => {
        const start = () => { signal.removeEventListener('abort', drop); resolve() }
        const drop = () => {
          const at = waiting.indexOf(start)
          if (at >= 0) waiting.splice(at, 1)
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
        }
        if (signal.aborted) return drop()
        waiting.push(start)
        signal.addEventListener('abort', drop, { once: true })
      })
    }
    running++
    try {
      return await task()
    } finally {
      next()
    }
  }
}
export type Limiter = ReturnType<typeof createLimiter>
