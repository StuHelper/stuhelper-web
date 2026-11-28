// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import zh from '../../locales/zh-CN.json'
import { useRatingText } from './presentation'

// A school whose configured wording follows the contract: index 0 is "not enough data".
const configured = [['暂无足够数据', '很差', '较差', '一般', '较好', '极佳']]
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  useAcademic: () => ({ presentation: vi.fn(async () => ({ effective: { school_id: 's', revision: 1, rating_texts: { 'zh-CN': configured } }, configured: null, source: 'school' })) }),
}))

const disposals: (() => void)[] = []
afterEach(() => { for (const dispose of disposals.splice(0)) dispose() })

function mount(style: 'academic' | 'browse') {
  let text: ReturnType<typeof useRatingText> | undefined
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } })
  const app = createApp({ setup() { text = useRatingText('s', style); return () => h('div') } })
  app.use(i18n)
  app.mount(document.createElement('div'))
  disposals.push(() => app.unmount())
  if (!text) throw new Error('fixture failed')
  return text
}
async function settle() { for (let i = 0; i < 5; i++) await Promise.resolve(); await nextTick() }

describe('rating text', () => {
  it.each(['academic', 'browse'] as const)('names the dimension at level 0 and uses the school wording above it (%s)', async (style) => {
    const text = mount(style)
    await settle()
    expect(text(0, 0)).toBe('推荐度')
    expect(text(0, 5)).toBe('极佳')
  })
})
