// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { i18n } from '../../app/i18n'
import { hostFetchKey } from '../../shared/api/transport'
import EmailTransferWithdraw from './EmailTransferWithdraw.vue'

const path = '/api/v1/verification/email-transfer-consent'
let app: App | undefined

function mountWithdrawal(fetcher: typeof fetch, always = false) {
  const root = document.createElement('div')
  app = createApp(EmailTransferWithdraw, { always }).use(i18n).provide(hostFetchKey, fetcher)
  app.mount(root)
  return root
}

afterEach(() => app?.unmount())

it('lets the account reload its withdrawal status after the document source recovers', async () => {
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ code: 'dependency_unavailable' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({
      accepted: true,
      document: {
        document_id: 'email-transfer',
        version: 'v1',
        digest: 'a'.repeat(64),
        url: 'https://legal.example.invalid/api/v1/legal/documents/email-transfer/versions/v1/html',
      },
    }))
  const root = mountWithdrawal(fetcher)

  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain(i18n.global.t('errors.unavailable')))
  const retry = root.querySelector('button')
  expect(retry?.textContent?.trim()).toBe(i18n.global.t('common.retry'))
  retry?.click()

  await vi.waitFor(() => expect(root.querySelector('button')?.textContent?.trim()).toBe(i18n.global.t('verification.transfer.withdraw')))
  expect(root.querySelector('[role="alert"]')).toBeNull()
  expect(fetcher.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([[path, 'GET'], [path, 'GET']])
})

it('does not warn about a deployment where the withdrawal endpoint is unavailable', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ code: 'not_found' }, { status: 404 }))
  const root = mountWithdrawal(fetcher)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()

  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(root.querySelector('section')).toBeNull()
})

it.each([true, false])('shows the inactive consent explanation only on the privacy page (always=%s)', async (always) => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    accepted: false,
    document: {
      document_id: 'email-transfer', version: 'v1', digest: 'a'.repeat(64),
      url: 'https://legal.example.invalid/email-transfer/v1',
    },
  }))
  const root = mountWithdrawal(fetcher, always)
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
  expect(root.textContent?.includes(i18n.global.t('verification.transfer.notAccepted'))).toBe(always)
  expect(root.querySelector('section') !== null).toBe(always)
  expect(root.querySelector('button')).toBeNull()
})
