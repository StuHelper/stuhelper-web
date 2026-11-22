import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const origin = process.env.VITE_MEDIA_ORIGIN || 'https://media.stuhelper.com'
const url = new URL(origin)
if (url.protocol !== 'https:' || url.origin !== origin || !/^[a-z0-9.-]+$/i.test(url.hostname)) {
  throw new Error('VITE_MEDIA_ORIGIN must be an exact HTTPS origin')
}
const config = readFileSync('deploy/nginx.conf', 'utf8')
writeFileSync('deploy/nginx.conf', config.replaceAll("connect-src 'self' https://media.stuhelper.com", "connect-src 'self' " + origin))
