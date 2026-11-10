import contract from '../../../contracts/groups.openapi.json'
import type { components } from '../../api/groups.gen'
import type { Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type MyGroup = Schemas['MyGroup']
export type NextAction = MyGroup['next_actions'][number]

const parsePage = schemaOf<Schemas['MyGroupPage']>(contract.components.schemas, 'MyGroupPage')
export const pageSize = 50

/** Where each suggested next step is done on this site; other steps happen in QQ. */
export const actionRoutes: Partial<Record<NextAction, string>> = {
  bind_qq: '/me/account#qq-title',
  verify_student: '/me/verification',
}

/**
 * The caller's own QQ groups and pending join applications. Reads never change
 * a deadline or an application; the server decides eligibility from current facts.
 */
export class GroupsApi {
  constructor(private readonly http: Http) {}

  async mine(cursor: string, signal?: AbortSignal) {
    const page = await this.http.json('/api/v1/groups/me', parsePage, { query: { cursor: cursor || undefined, limit: pageSize }, signal })
    return { items: page.items, next: page.next_cursor }
  }
}

export function useGroupsApi() {
  return new GroupsApi(useHttp())
}
