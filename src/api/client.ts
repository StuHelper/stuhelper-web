import type { components } from './platform.gen'

export type Capabilities = components['schemas']['Capabilities']
export type ModuleStatus = components['schemas']['ModuleStatus']
export class PlatformError extends Error {
  constructor(public readonly code: 'network' | 'incompatible' | 'identity' | 'unauthenticated' | 'forbidden' | 'unavailable') {
    super(code)
  }
}

export async function request(path: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<unknown> {
  let response: Response
  try {
    response = await fetcher(path, { signal, credentials: 'same-origin', headers: { Accept: 'application/json' } })
  } catch (error) {
    if (signal.aborted) throw error
    throw new PlatformError('network')
  }
  if (!response.ok) {
    if (response.status === 401) throw new PlatformError('unauthenticated')
    if (response.status === 403) throw new PlatformError('forbidden')
    const body: unknown = await response.json().catch(() => null)
    if (typeof body === 'object' && body !== null && 'code' in body && body.code === 'identity_unavailable') throw new PlatformError('identity')
    throw new PlatformError('unavailable')
  }
  try { return await response.json() } catch { throw new PlatformError('incompatible') }
}

export async function getCapabilities(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Capabilities> {
  const value = await request('/api/v1/system/capabilities', signal, fetcher)
  if (typeof value !== 'object' || value === null || !('api_version' in value) || value.api_version !== 1 || !('capabilities' in value) || !Array.isArray(value.capabilities) || !value.capabilities.every((item: unknown) => typeof item === 'string')) {
    throw new PlatformError('incompatible')
  }
  return { api_version: 1, capabilities: value.capabilities as string[] }
}

export async function getModules(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ModuleStatus[]> {
  const value = await request('/api/v1/admin/modules', signal, fetcher)
  const states = new Set(['disabled', 'starting', 'ready', 'stopping', 'stopped', 'failed'])
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string' && 'state' in item && typeof item.state === 'string' && states.has(item.state))) {
    throw new PlatformError('incompatible')
  }
  return value as ModuleStatus[]
}
