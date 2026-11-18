import { ref } from 'vue'

export type ToastAction = { label: string; run: () => void }
export type Toast = { id: number; text: string; undo?: () => void; action?: ToastAction }

/** Short confirmations shown at the bottom of the page. A toast with undo or action stays longer. */
export const toasts = ref<Toast[]>([])
let sequence = 0

export function toast(text: string, undo?: () => void, action?: ToastAction) {
  const id = ++sequence
  toasts.value.push({ id, text, undo, action })
  setTimeout(() => dismiss(id), undo || action ? 5000 : 2600)
}

export function dismiss(id: number) {
  toasts.value = toasts.value.filter((row) => row.id !== id)
}
