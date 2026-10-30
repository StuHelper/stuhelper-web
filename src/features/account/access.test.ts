import { describe, expect, it } from 'vitest'
import type { CatalogObject } from '../academic/api'
import type { Application, Credential, Summary } from '../verification/api'
import { chooseCampus, deriveAccess, safeNext } from './access'

const summary = (campus_eligibility: boolean) => ({ campus_eligibility }) as Summary
const application = (state: Application['state']) => ({ state }) as Application
const credential = (state: Credential['state']) => ({ state }) as Credential
const school = (id: string) => ({ id }) as CatalogObject

describe('content access', () => {
  it('allows only current campus eligibility, whatever older records say', () => {
    expect(deriveAccess(summary(true), [application('rejected')], [credential('revoked')])).toBe('verified')
    expect(deriveAccess(summary(false), [], [credential('active')])).toBe('unverified')
  })
  it('separates an application in progress from a lapsed qualification', () => {
    expect(deriveAccess(summary(false), [application('pending_review')], [credential('expired')])).toBe('processing')
    expect(deriveAccess(summary(false), [application('supplement_required')], [])).toBe('processing')
    expect(deriveAccess(summary(false), [application('rejected')], [credential('expired')])).toBe('expired')
    expect(deriveAccess(summary(false), [application('rejected')], [])).toBe('unverified')
  })
  it('returns only to paths inside this site', () => {
    expect(safeNext('/courses/a?tab=1')).toBe('/courses/a?tab=1')
    for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example', '', undefined, ['/a']]) expect(safeNext(value)).toBe('')
  })
  it('refuses to guess the served school when several exist', () => {
    expect(chooseCampus([school('a')], undefined).id).toBe('a')
    expect(chooseCampus([school('a'), school('b')], 'b').id).toBe('b')
    expect(() => chooseCampus([school('a'), school('b')], undefined)).toThrow()
    expect(() => chooseCampus([], undefined)).toThrow()
  })
})
