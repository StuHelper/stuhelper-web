// @vitest-environment happy-dom
import { expect, it } from 'vitest'
import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import ActionError from './ActionError.vue'

const catalogs = import.meta.glob<{ errors: Record<string, string> }>('../../locales/*.json', { eager: true, import: 'default' })
it('renders method-specific failure messages in all eight languages', () => {
  expect(Object.keys(catalogs)).toHaveLength(8)
  for (const [path, messages] of Object.entries(catalogs)) {
    const locale = path.split('/').at(-1)?.replace('.json', '') ?? ''
    for (const code of ['real_name_mismatch', 'real_name_no_record', 'email_identity_mismatch', 'email_identity_no_record', 'school_credentials_rejected', 'school_account_locked', 'school_account_disabled', 'school_account_unavailable']) {
      const target = document.createElement('div')
      const app = createApp({ render: () => h(ActionError, { code }) })
      app.use(createI18n({ legacy: false, locale, messages: { [locale]: messages } }))
      app.mount(target)
      try {
        expect(messages.errors[code]).toBeTruthy()
        expect(target.textContent).toBe(messages.errors[code])
      } finally { app.unmount() }
    }
  }
})
