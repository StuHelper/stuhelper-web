/**
 * Presentation of a published legal document. The server sends rendered, sanitised HTML whose
 * bytes match the published digest; this module only rearranges it for reading. The leading
 * title and the "label value" block under it are lifted into the page header, chapter headings
 * get anchors for the table of contents, and a paragraph that is entirely bold becomes the
 * key-terms notice. Text and links are never changed.
 */
export interface LegalMeta { label: string; value: string }
export interface LegalHeading { id: string; text: string }
export interface LegalLayout {
  /** The document's own title line, when it starts with one. */
  title: string
  meta: LegalMeta[]
  headings: LegalHeading[]
  html: string
}

/** Short document numbers for the published set; other slugs fall back to their initials. */
const codes: Record<string, string> = {
  'sso-privacy': 'SSO-PP',
  'sso-terms': 'SSO-TOS',
  'terms': 'TOS',
  'privacy': 'PP',
  'content-rules': 'CR',
  'upload-license': 'UL',
  'minors': 'MIN',
  'transactions-refunds': 'TRR',
  'cloud-storage': 'CS',
  'developer-terms': 'DEV',
  'cookies-third-parties': 'CTP',
  'infringement': 'IPR',
  'email-transfer': 'XBT',
}

export function documentCode(slug: string) {
  const code = codes[slug] ?? slug.split('-').map((part) => part[0]).join('').toUpperCase()
  return `SH-${code}`
}

const metaLine = /^(\S{1,12})\s+(.{1,80})$/

export function layoutDocument(html: string, version: string): LegalLayout {
  const page = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = page.body.firstElementChild
  if (!root) return { title: '', meta: [], headings: [], html }

  let title = ''
  const first = root.firstElementChild
  if (first?.tagName === 'H1') {
    title = first.textContent?.trim() ?? ''
    first.remove()
  }

  // The template opens with "版本 3.0<br>修订日期 …" lines. Lift them only when every line has
  // that shape and one of them carries this version, so ordinary prose is never taken.
  const meta: LegalMeta[] = []
  const block = root.firstElementChild
  if (block?.tagName === 'P' && block.querySelector('br') && !block.querySelector('a, strong')) {
    const lines = (block.textContent ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    const pairs = lines.map((line) => metaLine.exec(line))
    if (pairs.length > 0 && pairs.every(Boolean) && pairs.some((pair) => pair?.[2] === version)) {
      for (const pair of pairs) if (pair?.[1] && pair[2]) meta.push({ label: pair[1], value: pair[2] })
      block.remove()
    }
  }

  for (const paragraph of root.querySelectorAll(':scope > p')) {
    const nodes = [...paragraph.childNodes].filter((node) => node.nodeType !== Node.TEXT_NODE || node.textContent?.trim())
    if (nodes.length === 1 && nodes[0] instanceof Element && nodes[0].tagName === 'STRONG') paragraph.classList.add('legal-key')
  }

  const headings: LegalHeading[] = []
  root.querySelectorAll(':scope > h2').forEach((heading, index) => {
    const id = `section-${index + 1}`
    heading.id = id
    headings.push({ id, text: heading.textContent?.trim() ?? '' })
  })
  for (const table of root.querySelectorAll('table')) {
    const frame = page.createElement('div')
    frame.className = 'legal-table'
    table.replaceWith(frame)
    frame.append(table)
  }
  return { title, meta, headings, html: root.innerHTML }
}
