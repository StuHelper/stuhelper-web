/** Browser-only transport for authenticated Catalog image reads. */
const imageRoute = /^\/api\/v1\/catalog\/(?:objects\/[^/?#]+\/teacher-homepage\/(?:photos\/[0-9a-f]{64}(?:\/thumbnail)?|images\/[0-9a-f]{64})|admin\/schools\/[^/?#]+\/teacher-sites\/requests\/[^/?#]+\/photo)$/

function configuredOrigin() {
  try {
    const url = new URL(import.meta.env.VITE_MEDIA_ORIGIN || 'https://media.stuhelper.com')
    if (url.protocol === 'https:' && !url.username && !url.password && url.href === url.origin + '/') return url.origin
  } catch { /* An invalid setting disables cross-origin image reads. */ }
  return ''
}

export const mediaFetch: typeof fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input), window.location.href)
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  if (method !== 'GET' || target.origin !== window.location.origin || target.search || target.hash ||
      target.username || target.password || !imageRoute.test(target.pathname)) throw new TypeError('media_route_mismatch')

  // Only the Catalog GET uses the session. Never forward caller-supplied headers to the CDN.
  const options: RequestInit = {
    method, signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
    mode: 'cors', credentials: 'same-origin', redirect: 'follow', cache: 'no-store',
  }
  const mediaOrigin = configuredOrigin()
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(target, options)
    const origin = response.url && new URL(response.url).origin
    if (origin === window.location.origin) return response
    if (!origin || origin !== mediaOrigin) {
      await response.body?.cancel()
      throw new TypeError('media_origin_mismatch')
    }
    // An expired signed link can return 403. Ask Catalog for a fresh decision once.
    if (response.status !== 403 || attempt > 0) return response
    await response.body?.cancel()
  }
}
