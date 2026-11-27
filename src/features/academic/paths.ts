/**
 * Page paths of courses and teachers. A page is addressed by the short address the catalog
 * assigns (`address_id`, such as a course code or a five-digit teacher number). An object
 * known only by its internal id still links by that id; the page resolves it and shows the
 * short address. Reviews, favorites and other references always keep the internal id.
 */
export interface Addressable { id: string; address_id?: string | null }

export function subjectPath(kind: 'course' | 'teacher', target: Addressable | string): string {
  const address = typeof target === 'string' ? target : target.address_id || target.id
  return `/${kind === 'course' ? 'courses' : 'teachers'}/${encodeURIComponent(address)}`
}
export const coursePath = (target: Addressable | string) => subjectPath('course', target)
export const teacherPath = (target: Addressable | string) => subjectPath('teacher', target)
