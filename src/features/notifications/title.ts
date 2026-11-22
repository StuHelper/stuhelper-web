import { useI18n } from 'vue-i18n'
import { isolate } from '../../shared/format'
import { titleMessage, type Notification } from './api'

/**
 * Readable notification titles. For titles about content the server sends the content's
 * current name in title_params.content_name with content_name_state; the name is read
 * from its own module under the reader's current access, so a removed or hidden item
 * reports a state instead of a name. Without a state only the identifier is shown.
 */
// Display state and links, never text placed in a sentence.
const hidden = new Set(['content_name', 'content_name_state', 'context_id', 'reason_code'])

export function useNotificationTitle() {
  const { t } = useI18n()
  return (item: Notification) => {
    const raw = item.title_params as Record<string, string | undefined>
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string' && !hidden.has(key)) params[key] = isolate(value)
    }
    const state = raw.content_name_state
    // A system notice without a content target carries only an internal reference,
    // which means nothing to the reader, so its title is shown without it.
    if (item.title_key.startsWith('notifications.system.') && !state) {
      return t(`notifications.titles.systemPlain.${item.title_key.slice('notifications.system.'.length)}`)
    }
    // Content notifications name the item in content_id; system notifications about a
    // review, comment or resource use reference_id. Both are replaced the same way.
    const slot = 'content_id' in params ? 'content_id' : 'reference_id' in params ? 'reference_id' : ''
    if (slot && state) {
      // Identifiers and names are isolated so right-to-left sentences keep their order.
      params[slot] = state === 'available' && raw.content_name
        ? t('notifications.namedContent', { name: isolate(raw.content_name) })
        : t(state === 'inaccessible' ? 'notifications.contentUnavailable' : 'notifications.contentNameUnavailable')
    }
    return t(titleMessage(item.title_key), params)
  }
}

/**
 * The localized reason of a result, shown only when the server attached a closed reason code.
 * Codes outside the contract are not shown, so server text never reaches the page.
 */
export function useNotificationReason() {
  const { t, te } = useI18n()
  return (item: Notification) => {
    const code = (item.title_params as Record<string, string | undefined>).reason_code
    const key = code ? `notifications.reasons.${code}` : ''
    return key && te(key) ? t('notifications.reason', { reason: t(key) }) : ''
  }
}
