import { shallowRef } from 'vue'

// 替代 window.confirm。界面由 ConfirmHost 显示，一次只保留最新的询问。
interface Question { message: string; resolve: (answer: boolean) => void }
export const question = shallowRef<Question>()

export function askConfirm(message: string) {
  question.value?.resolve(false)
  return new Promise<boolean>((resolve) => { question.value = { message, resolve } })
}
export function answerConfirm(answer: boolean) {
  question.value?.resolve(answer)
  question.value = undefined
}
