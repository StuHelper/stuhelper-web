// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createRouter, createWebHistory, RouterView } from 'vue-router'
import { keepFiltersForReturn, usePageFilters } from './pageFilters'

const keys = ['q', 'department'] as const

async function mount(url: string) {
  let page!: ReturnType<typeof usePageFilters<(typeof keys)[number]>>
  const Page = defineComponent({ setup: () => { page = usePageFilters(keys); return () => h('div') } })
  const router = createRouter({ history: createWebHistory(), routes: [{ path: '/courses', component: Page }, { path: '/other', component: Page }] })
  const app = createApp(RouterView)
  app.use(router)
  await router.replace(url)
  await router.isReady()
  app.mount(document.createElement('div'))
  return { page, router, app }
}

describe('page filters', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('moves legacy query and fragment filters out of the address', async () => {
    const { page, app } = await mount('/courses?department=d1&lang=en-US#q=math')
    await new Promise((resolve) => setTimeout(resolve))
    expect(page.values.value).toEqual({ q: 'math', department: 'd1' })
    expect(window.location.search).toBe('?lang=en-US')
    expect(window.location.hash).toBe('')
    app.unmount()
  })

  it('keeps filters in history state across replace', async () => {
    const { page, app } = await mount('/courses')
    page.replace({ q: 'algebra' })
    expect(page.values.value.q).toBe('algebra')
    expect(window.location.href).not.toContain('algebra')
    expect((window.history.state as { filters: unknown }).filters).toEqual({ q: 'algebra' })
    app.unmount()
  })

  it('restores filters once after a sign-in round trip on the same page', async () => {
    window.history.replaceState({ filters: { department: 'd2' } }, '', '/courses')
    keepFiltersForReturn()
    // Coming back from the identity provider is a fresh entry without state.
    window.history.replaceState(null, '', '/courses')
    const first = await mount('/courses')
    expect(first.page.values.value.department).toBe('d2')
    first.app.unmount()
    window.history.replaceState(null, '', '/courses')
    const second = await mount('/courses')
    expect(second.page.values.value.department).toBe('')
    second.app.unmount()
  })

  it('does not hand saved filters to a different page', async () => {
    window.history.replaceState({ filters: { q: 'x' } }, '', '/other')
    keepFiltersForReturn()
    window.history.replaceState(null, '', '/courses')
    const { page, app } = await mount('/courses')
    expect(page.values.value.q).toBe('')
    app.unmount()
  })
})

describe('page filters after leaving the page', () => {
  it('does not write into the next page when a delayed change arrives late', async () => {
    window.history.replaceState(null, '', '/')
    const { page, router, app } = await mount('/courses')
    await router.push('/other')
    page.replace({ q: 'late' })
    expect((window.history.state as { filters?: unknown }).filters).toBeUndefined()
    app.unmount()
  })
})
