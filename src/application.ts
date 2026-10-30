import { createApp } from 'vue'
import App from './App.vue'
import { i18n, prepareLocale } from './app/i18n'
import { createAppRouter } from './app/router'
import { hostFetchKey, sessionFetch } from './shared/api/transport'
import { createSessionStore, sessionKey } from './shared/session'
import './styles/base.css'
import './styles/components.css'

/**
 * Create the Web application. A host may pass its authenticated transport;
 * every business request then obtains current credentials from it.
 */
export function createApplication(fetcher: typeof fetch = sessionFetch) {
  const session = createSessionStore(fetcher)
  const router = createAppRouter()
  void prepareLocale()
  void session.reload()
  return createApp(App).provide(hostFetchKey, fetcher).provide(sessionKey, session).use(i18n).use(router)
}
