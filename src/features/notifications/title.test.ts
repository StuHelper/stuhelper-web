// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import type { Notification } from './api'
import { useNotificationReason, useNotificationTitle } from './title'

const messages = {
  en: {
    notifications: {
      titles: {
        interaction: { reply: 'Your content {content_id} received a reply' },
        // Deliberately reference both metadata fields to catch accidental interpolation.
        content: { rejected: 'Review rejected for {content_id}{context_id}{reason_code}' },
        system: { notice: 'Notice about {reference_id}' },
        systemPlain: { notice: 'System notice' },
      },
      namedContent: '“{name}”',
      contentUnavailable: '(content unavailable)',
      contentNameUnavailable: '(name unavailable right now)',
      reason: 'Reason: {reason}',
      reasons: { insufficient_evidence: 'Not enough evidence' },
    },
  },
}

function notificationText(
  useText: typeof useNotificationTitle,
  params: Record<string, string>,
  key: Notification['title_key'],
) {
  let result = ''
  const app = createApp(defineComponent({
    setup() {
      const renderText = useText()
      // Exercise the available display fields even for legacy or unknown values.
      result = renderText({ title_key: key, title_params: params } as unknown as Notification)
      return () => null
    },
  }))
  app.use(createI18n({ legacy: false, locale: 'en', messages }))
  app.mount(document.createElement('div'))
  app.unmount()
  return result
}

function titleOf(params: Record<string, string>, key: Notification['title_key'] = 'notifications.interaction.reply') {
  // Strip the bidirectional isolation marks so the assertions read plainly.
  return notificationText(useNotificationTitle, params, key).replace(/[⁦-⁩]/g, '')
}

describe('notification titles', () => {
  it('uses the current content name when the server provides it', () => {
    expect(titleOf({ content_id: 'r1', content_name: 'Calculus notes', content_name_state: 'available' })).toBe('Your content “Calculus notes” received a reply')
  })

  it('shows a state instead of a name for removed or unreadable content', () => {
    expect(titleOf({ content_id: 'r1', content_name: '', content_name_state: 'inaccessible' })).toBe('Your content (content unavailable) received a reply')
    expect(titleOf({ content_id: 'r1', content_name: '', content_name_state: 'unavailable' })).toBe('Your content (name unavailable right now) received a reply')
  })

  it('keeps the identifier for servers that send no name', () => {
    expect(titleOf({ content_id: 'r1' })).toBe('Your content r1 received a reply')
  })

  it('names the item of a system notice that refers to content', () => {
    expect(titleOf({ reference_id: 'x7', content_name: 'Exam notes', content_name_state: 'available' }, 'notifications.system.notice')).toBe('Notice about “Exam notes”')
    expect(titleOf({ reference_id: 'x7', content_name: '', content_name_state: 'inaccessible' }, 'notifications.system.notice')).toBe('Notice about (content unavailable)')
    expect(titleOf({ reference_id: 'sec-1' }, 'notifications.system.notice')).toBe('System notice')
  })

  it('withholds context IDs and reason codes from title interpolation', () => {
    expect(titleOf({
      content_id: 'comment-1',
      content_name: 'Exam notes',
      content_name_state: 'available',
      context_id: 'review-1',
      reason_code: 'insufficient_evidence',
    }, 'notifications.content.rejected')).toBe('Review rejected for “Exam notes”')
  })
})

describe('notification reasons', () => {
  it('localizes a known reason code', () => {
    expect(notificationText(useNotificationReason, {
      reason_code: 'insufficient_evidence',
    }, 'notifications.content.rejected')).toBe('Reason: Not enough evidence')
  })

  it('shows no reason when the code is unknown or missing', () => {
    expect(notificationText(useNotificationReason, {
      reason_code: 'unknown_reason',
    }, 'notifications.content.rejected')).toBe('')
    expect(notificationText(useNotificationReason, {}, 'notifications.content.rejected')).toBe('')
  })
})
