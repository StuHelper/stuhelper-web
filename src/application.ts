import { sessionFetch } from './api/session';
import { createApp } from 'vue';
import App from './App.vue';
import { hostFetchKey } from './api/host';
import { i18n } from './i18n';
import { router } from './router';

export function createApplication(fetcher: typeof fetch = sessionFetch) {
  return createApp(App).provide(hostFetchKey, fetcher).use(i18n).use(router);
}
