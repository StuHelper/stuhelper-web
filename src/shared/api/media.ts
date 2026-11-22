/**
 * Teacher photos and body images are read through their Catalog address, which answers
 * with a 60-second signed link on the media host once the reader's access is checked.
 * The redirect leaves the site, so this transport is the only one allowed to follow it:
 * it starts only from a known Catalog image route, sends the session cookie only to the
 * site itself (the browser drops it across origins) and accepts the final response only
 * from the site or the configured HTTPS media host.
 */
export const mediaOrigin = (() => {
  const configured = import.meta.env.VITE_MEDIA_ORIGIN as string | undefined
  try {
    const url = new URL(configured || 'https://media.stuhelper.com')
    return url.protocol === 'https:' ? url.origin : ''
  } catch {
    return ''
  }
})()

const imageRoute = /^\/api\/v1\/catalog\/(?:objects\/[^/?#]+\/teacher-homepage\/(?:photos|images)\/[0-9a-f]{64}|admin\/schools\/[^/?#]+\/teacher-sites\/requests\/[^/?#]+\/photo)$/

export const mediaFetch: typeof fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : String(input), window.location.href)
  if (target.origin !== window.location.origin || !imageRoute.test(target.pathname)) throw new TypeError('media_route_mismatch')
  const response = await fetch(target, { ...init, mode: 'cors', credentials: 'same-origin', redirect: 'follow' })
  // An opaque or unexpected final address is never read.
  const final = response.url ? new URL(response.url) : target
  if (final.origin !== window.location.origin && final.origin !== mediaOrigin) throw new TypeError('media_origin_mismatch')
  return response
}
