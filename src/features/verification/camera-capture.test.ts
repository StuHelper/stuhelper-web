// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import CameraCapture from './CameraCapture.vue'

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), write: vi.fn(), upload: vi.fn(), material: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), useVerification: () => api }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AA==') } }))

let app: App | undefined

async function settle() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

afterEach(() => {
  app?.unmount()
  app = undefined
  vi.useRealTimers()
})

it('polls phone capture materials while QR is open, ignores existing IDs and collapses QR on arrival', async () => {
  vi.useFakeTimers()
  const materials: unknown[] = []
  api.write.mockResolvedValue({ token: 'A'.repeat(43), expires_at: '2026-11-18T02:00:00Z' })
  api.list.mockImplementation(async (kind: string) => (kind === 'Material' ? { items: [...materials], next: '' } : { items: [], next: '' }))
  const captured: unknown[] = []
  const i18n = createI18n({ legacy: false, locale: 'zh-CN', missingWarn: false, fallbackWarn: false, messages: { 'zh-CN': {} } })
  const root = document.createElement('div')
  app = createApp({
    render: () => h(CameraCapture, {
      applicationId: 'app-1',
      existingIds: ['old-mat'],
      onCaptured: (item: unknown) => captured.push(item),
    }),
  }).use(i18n)
  app.mount(root)
  await settle()

  const phoneBtn = [...root.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'verification.capture.phone')
  if (!phoneBtn) throw new Error('missing phone capture button')
  phoneBtn.click()
  await settle()
  expect(root.querySelector('.phone-ticket')).not.toBeNull()

  materials.push(
    { id: 'old-mat', application_id: 'app-1', content_type: 'image/png', size: 68, created_at: '2026-11-18T01:00:00Z' },
    { id: 'phone-mat-1', application_id: 'app-1', content_type: 'image/png', size: 68, created_at: '2026-11-18T01:01:00Z' },
  )
  await vi.advanceTimersByTimeAsync(3000)
  await settle()

  expect(captured).toHaveLength(1)
  expect(captured[0]).toMatchObject({ id: 'phone-mat-1' })
  expect(root.querySelector('.phone-ticket')).toBeNull()
})
