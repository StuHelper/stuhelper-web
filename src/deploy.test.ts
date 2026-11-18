import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const nginxConf = fs.readFileSync(path.join(root, 'deploy/nginx.conf'), 'utf8')
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')

function extractLocation(conf: string, header: string) {
  const start = conf.indexOf(header)
  expect(start).toBeGreaterThanOrEqual(0)
  const open = conf.indexOf('{', start)
  let depth = 0
  for (let i = open; i < conf.length; i++) {
    if (conf[i] === '{') depth++
    else if (conf[i] === '}') {
      depth--
      if (depth === 0) return conf.slice(open + 1, i)
    }
  }
  throw new Error(`unclosed block: ${header}`)
}

describe('production container and nginx configuration', () => {
  it('separates immutable hashed assets from no-cache SPA HTML and sets security headers per location', () => {
    expect(nginxConf).toContain('gzip on;')
    expect(nginxConf).toContain('gzip_static on;')
    expect(nginxConf).toContain('server_tokens off;')

    const apiBlock = extractLocation(nginxConf, 'location /api/')
    expect(apiBlock).toContain('proxy_set_header X-Forwarded-Proto $scheme;')

    const assetsBlock = extractLocation(nginxConf, 'location ^~ /assets/')
    expect(assetsBlock).toContain('Cache-Control "public, max-age=31536000, immutable" always;')
    expect(assetsBlock).toContain('try_files $uri =404;')

    const indexBlock = extractLocation(nginxConf, 'location = /index.html')
    expect(indexBlock).toContain('Cache-Control "no-cache" always;')

    const spaBlock = extractLocation(nginxConf, 'location / {')
    expect(spaBlock).toContain('Cache-Control "no-cache" always;')
    expect(spaBlock).toContain('try_files $uri $uri/ /index.html;')

    for (const block of [assetsBlock, indexBlock, spaBlock]) {
      expect(block).toContain('X-Content-Type-Options "nosniff" always;')
      expect(block).toContain('Referrer-Policy "strict-origin-when-cross-origin" always;')
      expect(block).toContain('Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;')
      expect(block).toContain('X-Frame-Options "SAMEORIGIN" always;')
      expect(block).toContain('Content-Security-Policy ')
    }
  })

  it('keeps explicit version tags in Dockerfile and drops privileges to non-root nginx user', () => {
    const fromLines = dockerfile.split('\n').filter((line) => line.startsWith('FROM '))
    expect(fromLines.length).toBeGreaterThanOrEqual(2)
    for (const line of fromLines) {
      expect(line).not.toContain('@sha256:')
      expect(line).not.toMatch(/:latest\b/)
    }
    expect(dockerfile).toContain('/tmp/nginx.pid')
    expect(dockerfile).toContain('chown -R nginx:nginx /var/cache/nginx /var/log/nginx')
    expect(dockerfile).toMatch(/^USER nginx$/m)
    expect(dockerfile).toMatch(/^EXPOSE 8080$/m)
  })
})
