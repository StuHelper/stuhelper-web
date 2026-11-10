import type { components } from '../../api/platform.gen'
import { ApiError } from '../../shared/api/errors'
import type { Http } from '../../shared/api/http'

export type Capabilities = components['schemas']['Capabilities']
export type ModuleStatus = components['schemas']['ModuleStatus']

const lifecycle = new Set(['disabled', 'starting', 'ready', 'stopping', 'stopped', 'failed'])
const health = new Set(['available', 'disabled', 'unavailable'])
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseCapabilities(value: unknown): Capabilities {
  if (!record(value) || value.api_version !== 1 || !Array.isArray(value.capabilities) || !value.capabilities.every((item) => typeof item === 'string')) throw new ApiError('incompatible')
  return { api_version: 1, capabilities: value.capabilities }
}

export function parseModules(value: unknown): ModuleStatus[] {
  if (!Array.isArray(value)) throw new ApiError('incompatible')
  for (const item of value) {
    if (!record(item) || typeof item.id !== 'string' || typeof item.state !== 'string' || !lifecycle.has(item.state)) throw new ApiError('incompatible')
    if (item.health !== undefined && (typeof item.health !== 'string' || !health.has(item.health))) throw new ApiError('incompatible')
  }
  // Every entry was checked against the lifecycle and health enumerations above.
  return value as ModuleStatus[]
}

export const getCapabilities = (http: Http, signal?: AbortSignal) => http.json('/api/v1/system/capabilities', parseCapabilities, { signal, timeout: 5000 })
export const getModules = (http: Http, signal?: AbortSignal) => http.json('/api/v1/admin/modules', parseModules, { signal, timeout: 5000 })
