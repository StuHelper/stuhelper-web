// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { layoutDocument } from './document'

const published = `<h1>StuHelper 用户服务协议</h1>
<p>版本 SH-TOS-2026.11.23<br>
修订日期 2026-11-22<br>
生效日期 2026-11-23<br>
运营主体 StuHelper</p>
<p><strong>订立前请阅读第 1.3 条。</strong></p>
<h2>第一条 订约主体</h2>
<p>1.1 本协议由 StuHelper 与你订立，详见<a href="https://stuhelper.com/legal/privacy">《隐私政策》</a>。</p>
<h2>第二条 登录</h2>
<table><tbody><tr><td>会话</td><td>30 日</td></tr></tbody></table>`

describe('layoutDocument', () => {
  it('lifts the title and header block, marks the key-terms notice and anchors chapters', () => {
    const layout = layoutDocument(published, 'SH-TOS-2026.11.23')
    expect(layout.title).toBe('StuHelper 用户服务协议')
    expect(layout.meta).toEqual([
      { label: '版本', value: 'SH-TOS-2026.11.23' },
      { label: '修订日期', value: '2026-11-22' },
      { label: '生效日期', value: '2026-11-23' },
      { label: '运营主体', value: 'StuHelper' },
    ])
    expect(layout.headings).toEqual([{ id: 'section-1', text: '第一条 订约主体' }, { id: 'section-2', text: '第二条 登录' }])
    expect(layout.html).not.toContain('<h1>')
    expect(layout.html).not.toContain('修订日期')
    expect(layout.html).toContain('<p class="legal-key"><strong>订立前请阅读第 1.3 条。</strong></p>')
    expect(layout.html).toContain('<h2 id="section-1">')
    expect(layout.html).toContain('<div class="legal-table"><table>')
    expect(layout.html).toContain('href="https://stuhelper.com/legal/privacy"')
  })

  it('keeps an opening paragraph that is ordinary prose', () => {
    const prose = '<h1>标题</h1>\n<p>第一行 说明<br>\n第二行 说明</p>\n<p>正文</p>'
    const layout = layoutDocument(prose, 'SH-TOS-2026.11.23')
    expect(layout.meta).toEqual([])
    expect(layout.html).toContain('第一行 说明')
  })
})
