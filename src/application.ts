import { createApp } from 'vue'
import App from './App.vue'
import { i18n, prepareLocale } from './app/i18n'
import { createAppRouter } from './app/router'
import { hostFetchKey, sessionFetch } from './shared/api/transport'
import { accessKey, createAccessStore } from './features/account/access'
import { createSessionStore, deniedKey, sessionKey } from './shared/session'
import { installTheme } from './shared/theme'
import { installTips } from './shared/ui/tips'
import './styles/base.css'
import './styles/components.css'

/**
 * Create the Web application. A host may pass its authenticated transport;
 * every business request then obtains current credentials from it.
 */
export function createApplication(fetcher: typeof fetch = sessionFetch) {
  installTips()
  installTheme()
  const session = createSessionStore(fetcher)
  const router = createAppRouter()
  void prepareLocale()
  void session.reload()
  const access = createAccessStore(fetcher, session)
  return createApp(App).provide(hostFetchKey, fetcher).provide(sessionKey, session).provide(accessKey, access).provide(deniedKey, () => void access.refresh()).use(i18n).use(router)
}
