import { reactive, watch } from 'vue'

/** Courses or teachers picked for side-by-side statistics. */
export type CompareKind = 'course' | 'teacher'
export const maxCompare = 5
const storageKey = 'stuhelper.compare'

function restore(): Record<CompareKind, string[]> {
  // Browser storage only remembers this viewer's picks; it may be missing or blocked.
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (value && typeof value === 'object') {
      const pick = (list: unknown) => (Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(0, maxCompare) : [])
      return { course: pick((value as Record<string, unknown>).course), teacher: pick((value as Record<string, unknown>).teacher) }
    }
  } catch {
    // Fall through to an empty selection.
  }
  return { course: [], teacher: [] }
}

export const compareList = reactive(restore())
watch(compareList, (value) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // The selection still works for this page view.
  }
})

/** Add or remove one item. Returns false when the list is already full. */
export function toggleCompare(kind: CompareKind, id: string) {
  const list = compareList[kind]
  const at = list.indexOf(id)
  if (at >= 0) {
    list.splice(at, 1)
    return true
  }
  if (list.length >= maxCompare) return false
  list.push(id)
  return true
}
