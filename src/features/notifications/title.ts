import { useI18n } from 'vue-i18n'
import { isolate } from '../../shared/format'
import { titleMessage, type Notification } from './api'

/**
 * Readable notification titles. The server sends the content's current name in
 * title_params.content_name when the list is read with include_content_names
 * (notifications 0.3); the name is read from its own module at that moment, so a
 * removed or hidden item reports a state instead of a name. Older servers send
 * only the identifier, which is shown as before.
 */
export function useNotificationTitle() {
  const { t } = useI18n()
  return (item: Notification) => {
    const raw = item.title_params as Record<string, string | undefined>
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === 'string' && key !== 'content_name' && key !== 'content_name_state') params[key] = isolate(value)
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
