import { createHash } from 'node:crypto';

export const legalPath = '/api/v1/legal/documents';

export function publishedDocument(slug, version, {
  title = slug === 'terms' ? 'StuHelper 用户服务协议' : 'StuHelper 隐私政策',
  effectiveDate = '2026-11-22',
  body = '<h2>服务范围</h2><p>本示例说明服务的使用方式及用户行权渠道。</p>',
} = {}) {
  const html = `<h1>${title}</h1>${body}`;
  return {
    slug,
    version,
    title,
    effective_date: effectiveDate,
    published_at: '2026-11-20T02:00:00Z',
    digest: createHash('sha256').update(html).digest('hex'),
    html,
  };
}

export function metadata({ slug, version, title, effective_date, published_at, digest }) {
  return { slug, version, title, effective_date, published_at, digest };
}
