import { ApiError } from './errors'

/**
 * Runtime validation of untrusted JSON against the shipped OpenAPI 3.0 schema.
 * Generated TypeScript types describe the contract but do not check responses,
 * so every response passes through this function before it is typed.
 */
type Schema = Record<string, unknown>
export type SchemaSet = Record<string, unknown>

const maxDepth = 24
const maxItems = 1000
const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validString(value: string, schema: Schema) {
  const length = [...value].length
  if (typeof schema.maxLength === 'number' && length > schema.maxLength) return false
  if (typeof schema.minLength === 'number' && length < schema.minLength) return false
  if (schema.format === 'date-time') return dateTime.test(value) && Number.isFinite(Date.parse(value))
  if (typeof schema.pattern === 'string') {
    try {
      return new RegExp(schema.pattern, 'u').test(value)
    } catch {
      return false
    }
  }
  return true
}

function validNumber(value: number, schema: Schema) {
  if (!Number.isFinite(value)) return false
  if (schema.type === 'integer' && !Number.isSafeInteger(value)) return false
  const { minimum, maximum } = schema
  if (typeof minimum === 'number' && (schema.exclusiveMinimum === true ? value <= minimum : value < minimum)) return false
  if (typeof maximum === 'number' && (schema.exclusiveMaximum === true ? value >= maximum : value > maximum)) return false
  return true
}

export function validates(value: unknown, schema: unknown, schemas: SchemaSet, depth = 0): boolean {
  if (!record(schema) || depth > maxDepth) return false
  if (typeof schema.$ref === 'string') {
    const target = schemas[schema.$ref.split('/').at(-1) ?? '']
    return validates(value, target, schemas, depth + 1)
  }
  if (value === null) return schema.nullable === true
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false
  // Combinators apply in addition to the schema's own type and properties.
  if (Array.isArray(schema.allOf) && !schema.allOf.every((part) => validates(value, part, schemas, depth + 1))) return false
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((part) => validates(value, part, schemas, depth + 1))) return false
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((part) => validates(value, part, schemas, depth + 1)).length !== 1) return false
  if (schema.type === undefined && (schema.allOf || schema.anyOf || schema.oneOf)) return true
  // A combinator branch such as { properties: { points: ... }, required: ['points'] } has no
  // type of its own; its object rules apply to objects. Other untyped schemas stay rejected.
  const type = schema.type ?? (record(value) && (schema.properties !== undefined || schema.required !== undefined) ? 'object' : undefined)
  switch (type) {
    case 'string':
      return typeof value === 'string' && validString(value, schema)
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
    case 'number':
      return typeof value === 'number' && validNumber(value, schema)
    case 'array': {
      if (!Array.isArray(value) || value.length > maxItems) return false
      if (typeof schema.minItems === 'number' && value.length < schema.minItems) return false
      if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return false
      return value.every((item) => validates(item, schema.items, schemas, depth + 1))
    }
    case 'object': {
      if (!record(value)) return false
      const keys = Object.keys(value)
      if (keys.length > maxItems) return false
      if (typeof schema.minProperties === 'number' && keys.length < schema.minProperties) return false
      if (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties) return false
      if (schema.properties !== undefined && !record(schema.properties)) return false
      const properties = record(schema.properties) ? schema.properties : {}
      if (Array.isArray(schema.required) && schema.required.some((key) => typeof key !== 'string' || !(key in value))) return false
      return keys.every((key) => {
        if (key in properties) return validates(value[key], properties[key], schemas, depth + 1)
        if (record(schema.additionalProperties)) return validates(value[key], schema.additionalProperties, schemas, depth + 1)
        return schema.additionalProperties !== false
      })
    }
    default:
      return false
  }
}

export type Validator<T> = (value: unknown) => T

/** Build a validator for one named component schema or a list of it. */
export function schemaOf<T>(schemas: SchemaSet, name: string, list = false): Validator<T> {
  const target = schemas[name]
  if (!record(target)) throw new Error(`Unknown contract schema: ${name}`)
  const shape = list ? { type: 'array', items: target } : target
  return (value) => {
    if (!validates(value, shape, schemas)) throw new ApiError('incompatible')
    // The value matched the contract schema that the generated type is derived from.
    return value as T
  }
}

export const stringList: Validator<string[]> = (value) => {
  if (!Array.isArray(value) || value.length > maxItems || !value.every((item) => typeof item === 'string')) throw new ApiError('incompatible')
  return value
}
