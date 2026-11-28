import { knownCredits, type CatalogObject, type DirectoryItem, type useAcademic } from './api'
import { recommendationLevel } from './ratings/levels'

/**
 * What a course search result shows, the same facts as a course list row: name, code,
 * credits, department, category, and, when the source has them, recommendation and
 * review count.
 */
export interface CourseCard {
  object: CatalogObject
  code: string
  credits?: number
  department: string
  category?: { id: string; name: string }
  /** Recommendation band 1 to 5; 0 when unknown or not enough reviews. */
  level: number
  /** Undefined when the source does not report it. */
  reviews?: number
}

export function cardFromDirectory(row: DirectoryItem): CourseCard {
  const category = row.categories[0]
  return {
    object: row.object,
    code: typeof row.object.code === 'string' ? row.object.code : '',
    credits: knownCredits(row.object),
    department: row.departments[0]?.name ?? '',
    category: category ? { id: category.id, name: category.name } : undefined,
    level: recommendationLevel[row.recommendation] ?? 0,
    reviews: row.review_count,
  }
}

const idOf = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

/**
 * Cards for courses known only by id, as in site search results. Two lookups: the
 * courses, then their departments and categories. Ratings are not part of a lookup.
 */
export async function cardsByIds(api: ReturnType<typeof useAcademic>, ids: string[], signal?: AbortSignal): Promise<Map<string, CourseCard>> {
  const cards = new Map<string, CourseCard>()
  if (!ids.length) return cards
  const courses = await api.lookup(ids, signal)
  const related = await api.lookup([...courses.values()].flatMap((course) => [idOf(course.department_id), idOf(course.category_id)]), signal)
  for (const [id, course] of courses) {
    const categoryId = idOf(course.category_id)
    const category = categoryId ? related.get(categoryId) : undefined
    cards.set(id, {
      object: course,
      code: typeof course.code === 'string' ? course.code : '',
      credits: knownCredits(course),
      department: related.get(idOf(course.department_id) ?? '')?.name ?? '',
      category: category ? { id: category.id, name: category.name } : undefined,
      level: 0,
    })
  }
  return cards
}
