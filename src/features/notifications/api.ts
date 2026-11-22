import contract from '../../../contracts/notifications.openapi.json'
import type { components } from '../../api/notifications.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type Schemas = components['schemas']
export type Notification = Schemas['Notification']
export type TitleKey = Schemas['TitleKey']
export type Preferences = Schemas['Preferences']
export type PreferencesUpdate = Schemas['PreferencesUpdate']
export type Unread = Schemas['Unread']
export type ReasonCode = Schemas['ReasonCode']

const schemas = contract.components.schemas
const parse = {
  page: schemaOf<Schemas['Page']>(schemas, 'Page'),
  unread: schemaOf<Schemas['Unread']>(schemas, 'Unread'),
  preferences: schemaOf<Preferences>(schemas, 'Preferences'),
}
export const pageSize = 30

/**
 * Local page for a notification target. `target.kind`, `target.id` and, for a comment,
 * the root review in `context_id` decide the route; other title parameters are display
 * text and never become part of an address. Without a root review a comment, like a
 * report, opens the personal content page, which lists its state.
 */
export function targetRoute(item: Pick<Notification, 'target' | 'title_params'>): string {
  const target = item.target
  const id = encodeURIComponent(target.id)
  // The server adds the root review of a comment only while the reader may open it.
  const context = (item.title_params as Record<string, string | undefined>).context_id
  if (target.kind === 'comment' && context && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(context)) return `/reviews/${encodeURIComponent(context)}`
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
    case 'moderation_appeal':
      return '/me/reviews'
    case 'group_membership':
      return '/me/groups'
    case 'storage_contribution':
      return '/me/storage'
    case 'billing_order':
      return '/me/wallet'
    default:
      return ''
  }
}

/** Boxes of the message center, in display order. */
export const boxes = ['interaction', 'review', 'verification', 'system'] as const
export type Box = (typeof boxes)[number]

/**
 * Box a notification is filed in, decided by the subject of its title key. This mirrors
 * the server's BoxForTitleKey, which filters lists and counts unread items per box;
 * the client uses it only to pick the icon of a row. Unknown subjects are system notices.
 */
export function boxOf(item: Pick<Notification, 'title_key'>): Box {
  const subject = item.title_key.slice('notifications.'.length).split('.')[0] ?? ''
  if (subject === 'interaction') return 'interaction'
  if (['content', 'resource_removal', 'report', 'appeal', 'teacher_homepage_request'].includes(subject)) return 'review'
  if (subject.endsWith('_verification') || subject.startsWith('verification_')) return 'verification'
  return 'system'
}

/** Message key of a title. The contract keys are already namespaced under `notifications.`. */
export const titleMessage = (key: TitleKey) => `notifications.titles.${key.slice('notifications.'.length)}`

/** The caller's in-site notifications. Marking as read needs no idempotency key: it is idempotent by nature. */
export class NotificationsApi {
  constructor(private readonly http: Http) {}

  /** Notifications newest first, all of them or one box. A cursor belongs to the list it was read from. */
  async list(box: Box | undefined, cursor: string, signal?: AbortSignal) {
    const page = await this.http.json('/api/v1/notifications', parse.page, { query: { box, cursor: cursor || undefined, limit: pageSize }, signal })
    return { items: page.items, next: page.next_cursor }
  }

  /** Unread totals: overall, per box and per type, all counted by the server. */
  summary(signal?: AbortSignal) {
    return this.http.json('/api/v1/notifications/unread-count', parse.unread, { signal })
  }

  async unread(signal?: AbortSignal) {
    return (await this.summary(signal)).count
  }

  async read(id: string) {
    await this.http.send(`/api/v1/notifications/${segment(id)}/read`, { method: 'POST' })
  }

  /** Mark everything read, or only one box when given. */
  async readAll(box?: Box) {
    await this.http.send('/api/v1/notifications/read-all', { method: 'POST', query: box ? { box } : undefined })
  }

  preferences(signal?: AbortSignal) {
    return this.http.json('/api/v1/notifications/preferences', parse.preferences, { signal })
  }

  /** Send only the switch that changed; the server keeps the other one. */
  savePreferences(body: PreferencesUpdate) {
    return this.http.json('/api/v1/notifications/preferences', parse.preferences, { method: 'PUT', body })
  }
}

export function useNotificationsApi() {
  return new NotificationsApi(useHttp())
}
