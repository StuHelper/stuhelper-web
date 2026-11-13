import contract from '../../../contracts/notifications.openapi.json'
import type { components } from '../../api/notifications.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type Notification = Schemas['Notification']
export type TitleKey = Schemas['TitleKey']
export type Preferences = Schemas['Preferences']

const schemas = contract.components.schemas
const parse = {
  page: schemaOf<Schemas['Page']>(schemas, 'Page'),
  unread: schemaOf<Schemas['Unread']>(schemas, 'Unread'),
  preferences: schemaOf<Preferences>(schemas, 'Preferences'),
}
export const pageSize = 30

/**
 * Local page for a notification target. Only `target.kind` and `target.id` decide the
 * route; title parameters are display text and never become part of an address.
 * Comments and reports open the personal content page, which lists their state.
 */
export function targetRoute(target: Notification['target']): string {
  const id = encodeURIComponent(target.id)
  switch (target.kind) {
    case 'review':
      return `/reviews/${id}`
    case 'resource':
      return `/resources/items/${id}`
    case 'comment':
    case 'report':
      return '/me/reviews'
    case 'resource_removal_request':
      return '/me/requests'
    case 'teacher_application':
      return '/me/verification/teacher'
    case 'verification_operation':
      return '/me/account/identity'
    case 'verification_application':
    case 'verification_credential':
    case 'verification_removal_request':
      return '/me/verification'
    default:
      return ''
  }
}

/** Boxes of the message center, in display order. */
export const boxes = ['interaction', 'review', 'verification', 'system'] as const
export type Box = (typeof boxes)[number]

/**
 * Box a notification is filed in, decided by the subject of its title key:
 * replies and likes, moderation results, verification results, and system
 * notices. An unknown subject is filed with system notices so nothing is lost.
 */
export function boxOf(item: Pick<Notification, 'title_key'>): Box {
  const subject = item.title_key.slice('notifications.'.length).split('.')[0] ?? ''
  if (subject === 'interaction') return 'interaction'
  if (['content', 'resource_removal', 'report'].includes(subject)) return 'review'
  if (subject.endsWith('_verification') || subject.startsWith('verification_')) return 'verification'
  return 'system'
}

/** Message key of a title. The contract keys are already namespaced under `notifications.`. */
export const titleMessage = (key: TitleKey) => `notifications.titles.${key.slice('notifications.'.length)}`

/** The caller's in-site notifications. Marking as read needs no idempotency key: it is idempotent by nature. */
export class NotificationsApi {
  constructor(private readonly http: Http) {}

  async list(cursor: string, signal?: AbortSignal) {
    const page = await this.http.json('/api/v1/notifications', parse.page, { query: { cursor: cursor || undefined, limit: pageSize }, signal })
    return { items: page.items, next: page.next_cursor }
  }

  async unread(signal?: AbortSignal) {
    return (await this.http.json('/api/v1/notifications/unread-count', parse.unread, { signal })).count
  }

  async read(id: string) {
    await this.http.send(`/api/v1/notifications/${segment(id)}/read`, { method: 'POST' })
  }

  async readAll() {
    await this.http.send('/api/v1/notifications/read-all', { method: 'POST' })
  }

  preferences(signal?: AbortSignal) {
    return this.http.json('/api/v1/notifications/preferences', parse.preferences, { signal })
  }

  savePreferences(body: Preferences) {
    return this.http.json('/api/v1/notifications/preferences', parse.preferences, { method: 'PUT', body })
  }
}

export function useNotificationsApi() {
  return new NotificationsApi(useHttp())
}
