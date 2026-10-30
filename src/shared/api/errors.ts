/**
 * Client-side failure codes. Business rejections keep the server's stable code;
 * transport and parsing failures use the codes below.
 */
export const clientCodes = ['network', 'timeout', 'incompatible', 'cancelled', 'retry_required'] as const

// Modules name the same HTTP meanings differently. Pages handle one spelling.
const aliases: Record<string, string> = {
  authentication_required: 'unauthenticated',
  permission_denied: 'forbidden',
  dependency_unavailable: 'unavailable',
  identity_unavailable: 'identity',
}

const statusCodes: Record<number, string> = {
  400: 'invalid_input',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'capacity_exceeded',
  429: 'rate_limited',
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    /** The write may have taken effect; only the original request may be retried. */
    readonly uncertain = false,
    readonly status?: number,
    readonly operationId?: string,
  ) {
    super(code)
    this.name = 'ApiError'
  }

  /** The current account lost access, so pages clear private data. */
  get denied() {
    return this.code === 'unauthenticated' || this.code === 'forbidden'
  }
}

// Some modules prefix codes with their own name, for example "resources_not_found".
const modulePrefix = /^(?:catalog|reviews|moderation|resources|media|storage|contribution|verification|profiles)_(.+)$/

export function normalizeCode(code: string) {
  const bare = modulePrefix.exec(code)?.[1] ?? code
  return aliases[bare] ?? bare
}

/** Accept only short snake_case codes so server text never reaches the page. */
export function serverCode(body: unknown, status: number) {
  if (typeof body === 'object' && body !== null && 'code' in body) {
    const code = body.code
    if (typeof code === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(code)) return normalizeCode(code)
  }
  return statusCodes[status] ?? 'unavailable'
}

export function errorCode(error: unknown) {
  if (error instanceof ApiError) return error.code
  if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
  return 'unavailable'
}

export function isUncertain(error: unknown) {
  return error instanceof ApiError && error.uncertain
}
