import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { components as Legal } from '../api/legal.gen'
import type { components as Session } from '../api/session.gen'
import { validSlug, validVersion } from '../features/legal/api'

type Publication = Legal['schemas']['PublicDocument']

// The text is synthetic. The route names match the imported production documents.
const texts = {
  terms: {
    title: 'StuHelper 用户服务协议',
    body: `<h2>第一条 适用范围与确认</h2>
<p>1.1 本演示协议说明校园服务的使用方式。你主动确认后，协议成立。</p>
<p>1.2 <strong>默认勾选、浏览和沉默不作为接受协议的依据。</strong></p>
<h2>第二条 账号与安全</h2>
<p>2.1 账号限本人使用，请妥善保管登录凭据。</p>
<h2>第三条 使用校园服务</h2>
<p>登录后，可以查看校园资料与课程评价。发布内容时，请尊重他人的权利。</p>
<ul><li>使用本人账号。</li><li>发布前检查资料是否允许分享。</li></ul>
<table>
<thead><tr><th scope="col">校园服务</th><th scope="col">使用方式</th></tr></thead>
<tbody><tr><td>学习资料</td><td>在资料页浏览和分享</td></tr><tr><td>课程评价</td><td>在课程页查看与撰写</td></tr></tbody>
</table>
<p>关于演示信息的处理，请参阅<a href="/legal/privacy">隐私政策</a>。</p>`,
  },
  privacy: {
    title: 'StuHelper 隐私政策',
    body: `<h2>信息处理示例</h2>
<p>下表展示隐私政策中常见的字段、用途和管理方式。</p>
<table>
<thead><tr><th scope="col">信息</th><th scope="col">用途</th><th scope="col">管理方式</th></tr></thead>
<tbody>
<tr><td>昵称</td><td>显示公开资料</td><td>在个人中心调整展示设置</td></tr>
<tr><td>通知偏好</td><td>选择接收的提醒</td><td>在通知设置中修改</td></tr>
</tbody>
</table>`,
  },
  'upload-license': {
    title: 'StuHelper 资料及用户内容上传授权协议',
    body: `<h2>分享资料</h2>
<p>上传前请检查资料的来源和分享权限。演示资料可在个人中心查看。</p>`,
  },
}

type DemoSlug = keyof typeof texts
// Versions are the document number plus the publication date, as in production.
const codes: Record<DemoSlug, string> = { 'terms': 'SH-TOS', 'privacy': 'SH-PP', 'upload-license': 'SH-UL' }

function publication(slug: DemoSlug, date: string): Publication {
  const { title, body } = texts[slug]
  const version = `${codes[slug]}-${date.replaceAll('-', '.')}`
  // Same opening as the imported templates: title, a "label value" block, then the body.
  const html = `<h1>${title}</h1>
<p>版本 ${version}<br>
修订日期 ${date}<br>
生效日期 ${date}<br>
运营主体 StuHelper 演示</p>
<p><strong>演示文档。订立前请阅读第一条的确认方式和第二条的账号规则。</strong></p>
${body}`
  return {
    slug, title, version, html,
    effective_date: date,
    published_at: `${date}T00:00:00+08:00`,
    digest: bytesToHex(sha256(new TextEncoder().encode(html))),
  }
}

const terms = publication('terms', '2026-11-01')
const privacy = publication('privacy', '2026-11-01')
const uploadLicense = publication('upload-license', '2026-11-01')
const history = new Map<string, readonly Publication[]>([
  ['terms', [
    terms,
    publication('terms', '2026-10-01'),
    // Two pages at the public Web page size of 50.
    ...Array.from({ length: 49 }, (_, index) => publication(
      'terms', new Date(Date.UTC(2026, 8 - index, 1)).toISOString().slice(0, 10),
    )),
  ]],
  ['privacy', [privacy, publication('privacy', '2026-10-01')]],
  ['upload-license', [uploadLicense]],
])

function reference(document: Publication, origin: string) {
  const { slug, version, digest } = document
  return { version, digest, url: new URL(`/legal/${slug}/versions/${version}`, origin).href }
}

export function demoUploadTerms(origin: string) {
  return { ...reference(uploadLicense, origin), document_id: 'upload-license' }
}

export function demoConsentStatus(origin: string): Session['schemas']['LegalConsentStatus'] {
  function accepted(document: Publication, receiptId: string): Session['schemas']['LegalConsentDocument'] {
    return {
      ...reference(document, origin), required: false,
      receipt: { accepted_at: '2026-11-02T00:00:00+08:00', source: 'registration', request_id: receiptId },
    }
  }
  return {
    required: false,
    documents: { terms: accepted(terms, 'a'.repeat(32)), privacy: accepted(privacy, 'b'.repeat(32)) },
  }
}

const invalid = () => Response.json({ code: 'invalid_input' }, { status: 400 })

function pageValue(values: string[], fallback: number, min: number, max: number) {
  if (values.length === 0) return fallback
  const [value] = values
  if (values.length !== 1 || value === undefined || !/^[0-9]+$/.test(value)) return
  const parsed = Number(value)
  if (parsed >= min && parsed <= max) return parsed
}

function listVersions(documents: readonly Publication[], query: URLSearchParams) {
  const limit = pageValue(query.getAll('limit'), 20, 1, 100)
  const offset = pageValue(query.getAll('offset'), 0, 0, 2_147_483_647)
  if (limit === undefined || offset === undefined) return invalid()
  const end = offset + limit
  const items = documents.slice(offset, end).map(({ html: _html, ...metadata }) => metadata)
  const page: Legal['schemas']['PublicDocumentPage'] = {
    items, ...(end < documents.length ? { next_offset: end } : {}),
  }
  return Response.json(page)
}

export function publicLegalRoute(path: string, method: string, query: URLSearchParams) {
  if (method !== 'GET') return
  const match = /^\/legal\/documents\/([^/]+)(?:\/versions(?:\/([^/]+))?)?(\/html)?$/.exec(path)
  if (!match) return
  const [, slugSegment = '', versionSegment, html] = match
  let slug: string
  let version: string | undefined
  try {
    slug = decodeURIComponent(slugSegment)
    version = versionSegment === undefined ? undefined : decodeURIComponent(versionSegment)
  } catch {
    return invalid()
  }
  if (!validSlug(slug) || (version !== undefined && !validVersion(version))) return invalid()
  const documents = history.get(slug) ?? []
  if (!version && path.endsWith('/versions')) return listVersions(documents, query)
  const document = version === undefined ? documents[0] : documents.find((item) => item.version === version)
  if (!document) return Response.json({ code: 'not_found' }, { status: 404 })
  return html
    ? new Response(document.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    : Response.json(document)
}
