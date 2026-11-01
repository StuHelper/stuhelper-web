import { i18n } from '../../app/i18n'

// 替代浏览器的 title 提示和表单校验气泡。图标按钮用 aria-label 作提示，其他元素用 data-tip。
const SELECTOR = '.btn-icon[aria-label], [data-tip]'
const HOVER_DELAY = 250
const GAP = 8
const INVALID_TIME = 4000

const textOf = (target: Element) => target.getAttribute('data-tip') ?? target.getAttribute('aria-label') ?? ''

export function installTips() {
  const tip = document.createElement('div')
  tip.className = 'app-tip'
  tip.hidden = true
  document.body.append(tip)
  let timer: number | undefined
  let current: Element | null = null
  let holdUntil = 0

  const hide = () => { window.clearTimeout(timer); current = null; tip.hidden = true; tip.classList.remove('app-tip-error') }
  const place = (target: Element, text: string) => {
    if (!target.isConnected || !text) return
    tip.textContent = text
    tip.hidden = false
    const box = target.getBoundingClientRect()
    const size = tip.getBoundingClientRect()
    const above = box.top - size.height - GAP
    tip.style.top = `${above >= GAP ? above : box.bottom + GAP}px`
    tip.style.left = `${Math.min(Math.max(GAP, box.left + box.width / 2 - size.width / 2), document.documentElement.clientWidth - size.width - GAP)}px`
  }
  const buttonOf = (event: Event) => (event.target instanceof Element ? event.target.closest(SELECTOR) : null)

  if (window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('mouseover', (event) => {
      if (performance.now() < holdUntil) return
      const target = buttonOf(event)
      if (target === current) return
      hide()
      if (target) { current = target; timer = window.setTimeout(() => place(target, textOf(target)), HOVER_DELAY) }
    })
  }
  document.addEventListener('focusin', (event) => { const target = buttonOf(event); if (target?.matches(':focus-visible')) { hide(); current = target; place(target, textOf(target)) } })
  document.addEventListener('focusout', () => { if (performance.now() >= holdUntil) hide() })
  document.addEventListener('click', () => { holdUntil = 0; hide() }, true)
  document.addEventListener('input', () => { holdUntil = 0; hide() }, true)
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { holdUntil = 0; hide() } })
  window.addEventListener('scroll', () => { if (performance.now() >= holdUntil) hide() }, true)

  // 一次提交会对每个无效字段各触发一次 invalid，只提示第一个。
  document.addEventListener('invalid', (event) => {
    event.preventDefault()
    if (performance.now() < holdUntil || !(event.target instanceof HTMLElement)) return
    const field = event.target as HTMLInputElement
    const visible = field.closest('.app-control')?.querySelector<HTMLElement>('button') ?? field
    const message = field.validity.valueMissing ? i18n.global.t('common.fieldRequired') : field.validationMessage
    holdUntil = performance.now() + INVALID_TIME
    visible.scrollIntoView({ block: 'nearest' })
    visible.focus({ preventScroll: true })
    window.clearTimeout(timer)
    tip.classList.add('app-tip-error')
    place(visible, message)
    timer = window.setTimeout(() => { holdUntil = 0; hide() }, INVALID_TIME)
  }, true)
}
