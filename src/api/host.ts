import { inject, type InjectionKey } from 'vue';

// The application supplies its authenticated transport at bootstrap. Each
// request obtains current credentials from that transport; business pages never
// persist tokens or turn provider passwords into application identities.
export const hostFetchKey: InjectionKey<typeof fetch> = Symbol('hostFetch');

export function useHostFetch(): typeof fetch {
  return inject(hostFetchKey, fetch);
}
