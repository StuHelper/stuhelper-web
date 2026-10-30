import catalogContract from '../../../contracts/catalog.openapi.json'
import moderationContract from '../../../contracts/moderation.openapi.json'
import reviewsContract from '../../../contracts/reviews.openapi.json'
import type { components as Catalog } from '../../api/catalog.gen'
import type { components as Moderation } from '../../api/moderation.gen'
import type { components as Reviews } from '../../api/reviews.gen'
import { ApiError } from '../../shared/api/errors'
import { segment, type Http, type Query } from '../../shared/api/http'
import { schemaOf, stringList } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

export type CatalogObject = Catalog['schemas']['Object']
export type ObjectKind = CatalogObject['kind']
export type ObjectPage = Catalog['schemas']['Page']
export type ObjectSummary = Catalog['schemas']['Summary']
export type Enrollment = Catalog['schemas']['Enrollment']
export type Review = Reviews['schemas']['View']
export type ReviewKind = ReviewInput['kind']
export type ReviewInput = Reviews['schemas']['Input']
export type ReviewPage = Reviews['schemas']['Page']
export type Statistics = Reviews['schemas']['Statistics']
export type Band = Reviews['schemas']['Band']
export type Draft = Reviews['schemas']['DraftView']
export type DraftWrite = Reviews['schemas']['DraftWrite']
export type ReviewAction = Reviews['schemas']['Action']
export type Result = Reviews['schemas']['Result']
export type Composer = Reviews['schemas']['Composer']
export type DisclosureKey = Reviews['schemas']['DisclosureKey']
export type DisclosureOption = Reviews['schemas']['DisclosureOption']
export type PresentationView = Reviews['schemas']['PresentationView']
export type Submission = Moderation['schemas']['Submission']
export type Task = Moderation['schemas']['TaskView']

const catalog = catalogContract.components.schemas
const reviews = reviewsContract.components.schemas
const moderation = moderationContract.components.schemas

const parse = {
  object: schemaOf<CatalogObject>(catalog, 'Object'),
  objectPage: schemaOf<ObjectPage>(catalog, 'Page'),
  summary: schemaOf<ObjectSummary>(catalog, 'Summary'),
  lookup: schemaOf<Catalog['schemas']['Lookup']>(catalog, 'Lookup'),
  enrollments: schemaOf<Enrollment[]>(catalog, 'Enrollment', true),
  review: schemaOf<Review>(reviews, 'View'),
  reviewList: schemaOf<Review[]>(reviews, 'View', true),
  reviewPage: schemaOf<ReviewPage>(reviews, 'Page'),
  statistics: schemaOf<Statistics>(reviews, 'Statistics'),
  draft: schemaOf<Draft>(reviews, 'DraftView'),
  drafts: schemaOf<Draft[]>(reviews, 'DraftView', true),
  result: schemaOf<Result>(reviews, 'Result'),
  composer: schemaOf<Composer>(reviews, 'Composer'),
  presentation: schemaOf<PresentationView>(reviews, 'PresentationView'),
  task: schemaOf<Task>(moderation, 'TaskView'),
  tasks: schemaOf<Task[]>(moderation, 'TaskView', true),
}

/** The five course dimensions, in contract order. */
export const dimensions = ['recommendation', 'quality', 'difficulty', 'workload', 'grading'] as const

/** Ask for one page more than shown so list endpoints without a cursor can tell whether more rows exist. */
export const listSize = 20

const presentationRequests = new Map<string, Promise<PresentationView>>()

/**
 * Catalog, reviews and moderation requests used by the academic pages. Every
 * response is validated against the provider contract before it is typed.
 */
export class AcademicApi {
  constructor(private readonly http: Http) {}

  objects(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/catalog/objects', parse.objectPage, { query, signal })
  }

  object(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/objects/${segment(id)}`, parse.object, { signal })
  }

  summary(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/objects/${segment(id)}/summary`, parse.summary, { signal })
  }

  /** Resolve display names for up to 100 objects in one request. */
  async lookup(ids: (string | undefined)[], signal?: AbortSignal): Promise<Map<string, CatalogObject>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))]
    if (unique.length === 0) return new Map()
    const names = new Map<string, CatalogObject>()
    for (let start = 0; start < unique.length; start += 100) {
      const result = await this.http.json('/api/v1/catalog/objects/lookup', parse.lookup, { query: { ids: unique.slice(start, start + 100).join(',') }, signal })
      for (const item of result.items) names.set(item.id, item)
    }
    return names
  }

  /** Every option for a selector. A selector must not silently drop options after the first page. */
  async options(query: Query, signal?: AbortSignal): Promise<CatalogObject[]> {
    const items: CatalogObject[] = []
    let after = ''
    for (let page = 0; page < 10; page++) {
      const result = await this.objects({ ...query, limit: 100, after }, signal)
      items.push(...result.items)
      if (!result.next) return items
      if (result.next === after) throw new ApiError('incompatible')
      after = result.next
    }
    throw new ApiError('capacity_exceeded')
  }

  myEnrollments(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/catalog/me/enrollments', parse.enrollments, { query, signal })
  }

  reviews(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews', parse.reviewPage, { query, signal })
  }

  review(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/reviews/${segment(id)}`, parse.review, { signal })
  }

  statistics(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/statistics', parse.statistics, { query, signal })
  }

  composer(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/compose', parse.composer, { query, signal })
  }

  /** Rating labels configured for a school. Concurrent requests share one fetch; results are not cached. */
  presentation(school: string): Promise<PresentationView> {
    const current = presentationRequests.get(school)
    if (current) return current
    const request = this.http.json('/api/v1/reviews/presentation', parse.presentation, { query: { school_id: school } })
    presentationRequests.set(school, request)
    void request.catch(() => undefined).finally(() => {
      if (presentationRequests.get(school) === request) presentationRequests.delete(school)
    })
    return request
  }

  myEntries(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/entries', parse.reviewPage, { query, signal })
  }

  myEntry(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/reviews/me/entries/${segment(id)}`, parse.review, { signal })
  }

  myDrafts(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/drafts', parse.drafts, { query, signal })
  }

  draft(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/reviews/me/drafts/${segment(id)}`, parse.draft, { signal })
  }

  myBookmarks(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/bookmarks', stringList, { query, signal })
  }

  myVotes(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/votes', parse.reviewList, { query, signal })
  }

  myTasks(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/moderation/tasks', parse.tasks, { query, signal })
  }

  publish(input: ReviewInput, key: string) {
    return this.http.json('/api/v1/reviews', parse.result, { method: 'POST', body: input, key })
  }

  reply(parentId: string, input: ReviewInput, key: string) {
    return this.http.json(`/api/v1/reviews/${segment(parentId)}/replies`, parse.result, { method: 'POST', body: input, key })
  }

  act(id: string, action: ReviewAction, key: string) {
    return this.http.json(`/api/v1/reviews/${segment(id)}/actions`, parse.result, { method: 'POST', body: action, key })
  }

  saveDraft(draft: DraftWrite, key: string) {
    return this.http.json('/api/v1/reviews/me/drafts', parse.result, { method: 'POST', body: draft, key })
  }

  publishDraft(id: string, body: { revision: number; input: ReviewInput }, key: string) {
    return this.http.json(`/api/v1/reviews/me/drafts/${segment(id)}/publish`, parse.result, { method: 'POST', body, key })
  }

  deleteDraft(id: string, body: { revision: number }, key: string) {
    return this.http.json(`/api/v1/reviews/me/drafts/${segment(id)}`, parse.result, { method: 'DELETE', body, key })
  }

  setBookmark(body: { target_id: string; set: boolean }, key: string) {
    return this.http.json('/api/v1/reviews/me/bookmarks', parse.result, { method: 'POST', body, key })
  }

  submitTask(submission: Submission, key: string) {
    return this.http.json('/api/v1/moderation/tasks', parse.task, { method: 'POST', body: submission, key })
  }
}

export function useAcademic() {
  return new AcademicApi(useHttp())
}

/** Cursor for list endpoints that return a bare array: the last id when the page is full. */
export function arrayCursor<T>(rows: T[], id: (row: T) => string) {
  const last = rows.at(-1)
  return rows.length === listSize && last !== undefined ? id(last) : ''
}

const subjectPrefixes: Partial<Record<ObjectKind, string>> = { course: 'courses', teacher: 'teachers', term_course: 'offerings', class: 'classes' }

export function subjectPath(object: Pick<CatalogObject, 'id' | 'kind'>) {
  const base = subjectPrefixes[object.kind]
  return base ? `/${base}/${encodeURIComponent(object.id)}` : ''
}

/** Credits are unknown when absent; zero credits is a real value. */
export function knownCredits(object: Pick<CatalogObject, 'credits'>) {
  return typeof object.credits === 'number' && Number.isFinite(object.credits) ? object.credits : undefined
}
