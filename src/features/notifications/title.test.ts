// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import type { Notification } from './api'
import { useNotificationTitle } from './title'

const messages = {
  en: {
    notifications: {
      titles: { interaction: { reply: 'Your content {content_id} received a reply' }, system: { notice: 'Notice about {reference_id}' } },
      namedContent: '“{name}”',
      contentUnavailable: '(content unavailable)',
      contentNameUnavailable: '(name unavailable right now)',
    },
  },
}

function titleOf(params: Record<string, string>, key = 'notifications.interaction.reply') {
  let result = ''
  const app = createApp(defineComponent({
    setup() {
      const title = useNotificationTitle()
      result = title({ title_key: key, title_params: params } as unknown as Notification)
      return () => null
    },
  }))
  app.use(createI18n({ legacy: false, locale: 'en', messages }))
  app.mount(document.createElement('div'))
  app.unmount()
  // Strip the bidirectional isolation marks so the assertions read plainly.
  return result.replace(/[⁦-⁩]/g, '')
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
    expect(titleOf({ reference_id: 'sec-1' }, 'notifications.system.notice')).toBe('Notice about sec-1')
  })
})
