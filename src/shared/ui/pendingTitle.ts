import { ref } from 'vue'

// 从列表进入详情时记下被点击的名称。详情数据到达前，骨架屏先显示这个名称，并让它从列表平滑移动到标题位置。
export const pendingTitle = ref('')
const MORPH = 'title-morph'
let source: HTMLElement | undefined

export function trackTitleClicks() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    source = event.target.closest<HTMLElement>('main a.name, main a.card-title') ?? undefined
  }, true)
}
/** 导航开始前调用。只有目标是详情页且点击来自列表名称时才生效。 */
export function beginMorph(toPath: string) {
  pendingTitle.value = ''
  if (!source?.isConnected || !/^\/(courses|teachers)\/[^/]+$/.test(toPath)) return
  pendingTitle.value = source.textContent?.trim() ?? ''
  source.style.viewTransitionName = MORPH
}
export function endMorph() {
  if (source) source.style.viewTransitionName = ''
  source = undefined
}
