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
  expect(root.querySelector('button')?.textContent.trim()).toBe(always ? i18n.global.t('verification.transfer.enable') : undefined)
})

it('reloads a changed notice, retries activation and withdraws the account grant', async () => {
  const documentRef = (version: string) => ({
    document_id: 'email-transfer', version, digest: (version === 'v1' ? 'a' : 'b').repeat(64),
    url: 'https://legal.example.invalid/email-transfer/' + version,
  })
  let version = 'v1'
  let accepted = false
  let attempts = 0
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === 'PUT') {
      attempts++
      const body = JSON.parse(String(init.body))
      if (attempts === 1) {
        expect(body.version).toBe('v1')
        version = 'v2'
        return Response.json({ code: 'email_transfer_consent_changed' }, { status: 409 })
      }
      expect(body).toEqual({ document_id: 'email-transfer', version, digest: 'b'.repeat(64), accepted: true })
      if (attempts === 2) return Response.json({ code: 'dependency_unavailable' }, { status: 503 })
      accepted = true
    }
    if (init?.method === 'DELETE') {
      accepted = false
      return Response.json({ withdrawn: true })
    }
    return Response.json({ accepted, document: documentRef(version) })
  })
  const root = mountWithdrawal(fetcher, true)
  const open = async (key: string) => {
    await vi.waitFor(() => expect(root.querySelector('button')?.textContent.trim()).toBe(i18n.global.t(key)))
    root.querySelector('button')!.click()
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"] button[type="submit"]')).toBeTruthy())
  }
  const confirm = () => document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!.click()
  await open('verification.transfer.enable')
  expect(document.querySelectorAll('[role="dialog"] dt')).toHaveLength(6)
  confirm()
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain(i18n.global.t('verification.transfer.changed')))
  await open('verification.transfer.enable')
  expect(document.querySelector('[role="dialog"] a')?.getAttribute('href')).toBe(documentRef('v2').url)
  confirm()
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(i18n.global.t('errors.unavailable')))
  confirm()
  await open('verification.transfer.withdraw')
  confirm()
  await vi.waitFor(() => expect(root.textContent).toContain(i18n.global.t('verification.transfer.notAccepted')))
  expect(attempts).toBe(3)
})
