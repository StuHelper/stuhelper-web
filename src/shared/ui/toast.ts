import { ref } from 'vue'

export type Toast = { id: number; text: string; undo?: () => void }

/** Short confirmations shown at the bottom of the page. A toast with undo stays longer. */
export const toasts = ref<Toast[]>([])
let sequence = 0

export function toast(text: string, undo?: () => void) {
  const id = ++sequence
  toasts.value.push({ id, text, undo })
  setTimeout(() => dismiss(id), undo ? 5000 : 2600)
}

export function dismiss(id: number) {
  toasts.value = toasts.value.filter((row) => row.id !== id)
}
