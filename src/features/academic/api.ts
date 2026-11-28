import catalogContract from '../../../contracts/catalog.openapi.json'
import moderationContract from '../../../contracts/moderation.openapi.json'
import reviewsContract from '../../../contracts/reviews.openapi.json'
import type { components as Catalog } from '../../api/catalog.gen'
import type { components as Moderation } from '../../api/moderation.gen'
import type { components as Reviews } from '../../api/reviews.gen'
import { ApiError } from '../../shared/api/errors'
import { saveBlob, segment, type Http, type Query } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { inject } from 'vue'
import { sessionKey, useHttp } from '../../shared/session'

export type CatalogObject = Catalog['schemas']['Object']
export type ObjectKind = CatalogObject['kind']
export type ObjectPage = Catalog['schemas']['Page']
export type ObjectSummary = Catalog['schemas']['PublicSummary']
export type Enrollment = Catalog['schemas']['Enrollment']
export type OwnSchedule = Catalog['schemas']['OwnSchedule']
export type ScheduleMeeting = Catalog['schemas']['ScheduleMeeting']
export type Timetable = Catalog['schemas']['Timetable']
export type DirectoryPage = Catalog['schemas']['DirectoryPage']
export type DirectoryItem = Catalog['schemas']['DirectoryItem']
export type DirectoryFacet = Catalog['schemas']['DirectoryFacet']
export type DirectorySort = 'hot' | 'recommend' | 'reviews' | 'name'
export type Recommendation = Catalog['schemas']['Recommendation']
export type RecentCourses = Catalog['schemas']['RecentCourses']
export type NextClassDay = Catalog['schemas']['NextClassDay']
export type Review = Reviews['schemas']['View']
export type OwnVote = Reviews['schemas']['OwnVote']
export type ReviewKind = ReviewInput['kind']
export type ReviewInput = Reviews['schemas']['Input']
export type Grade = Reviews['schemas']['Grade']
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
export type Reference = Reviews['schemas']['Reference']
export type ReviewSummary = Reviews['schemas']['ReviewSummary']
export type ReviewSummaries = Reviews['schemas']['ReviewSummaries']
export type OwnOverview = Reviews['schemas']['OwnOverview']
/** The name fields a review card shows. Catalog objects and own-record references both provide them. */
export type NamedObject = { id: string; kind: string; name: string }

const catalog = catalogContract.components.schemas
const reviews = reviewsContract.components.schemas
const moderation = moderationContract.components.schemas

const parse = {
  object: schemaOf<CatalogObject>(catalog, 'Object'),
  objectPage: schemaOf<ObjectPage>(catalog, 'Page'),
  filterOptions: schemaOf<Catalog['schemas']['FilterOptions']>(catalog, 'FilterOptions'),
  summary: schemaOf<ObjectSummary>(catalog, 'PublicSummary'),
  resolution: schemaOf<Catalog['schemas']['Resolution']>(catalog, 'Resolution'),
  enrollmentReferences: schemaOf<Catalog['schemas']['References']>(catalog, 'References'),
  lookup: schemaOf<Catalog['schemas']['Lookup']>(catalog, 'Lookup'),
  enrollments: schemaOf<Enrollment[]>(catalog, 'Enrollment', true),
  schedule: schemaOf<Catalog['schemas']['OwnSchedulePage']>(catalog, 'OwnSchedulePage'),
  directory: schemaOf<DirectoryPage>(catalog, 'DirectoryPage'),
  recent: schemaOf<RecentCourses>(catalog, 'RecentCourses'),
  recentRecorded: schemaOf<Catalog['schemas']['RecentRecorded']>(catalog, 'RecentRecorded'),
  recentCleared: schemaOf<Catalog['schemas']['RecentCleared']>(catalog, 'RecentCleared'),
  nextClassDay: schemaOf<NextClassDay>(catalog, 'NextClassDay'),
  review: schemaOf<Review>(reviews, 'View'),
  ownVotes: schemaOf<OwnVote[]>(reviews, 'OwnVote', true),
  reviewPage: schemaOf<ReviewPage>(reviews, 'Page'),
  statistics: schemaOf<Statistics>(reviews, 'Statistics'),
  draft: schemaOf<Draft>(reviews, 'DraftView'),
  drafts: schemaOf<Draft[]>(reviews, 'DraftView', true),
  result: schemaOf<Result>(reviews, 'Result'),
  composer: schemaOf<Composer>(reviews, 'Composer'),
  references: schemaOf<Reviews['schemas']['References']>(reviews, 'References'),
  presentation: schemaOf<PresentationView>(reviews, 'PresentationView'),
  summaries: schemaOf<ReviewSummaries>(reviews, 'ReviewSummaries'),
  overview: schemaOf<OwnOverview>(reviews, 'OwnOverview'),
  task: schemaOf<Task>(moderation, 'TaskView'),
  tasks: schemaOf<Task[]>(moderation, 'TaskView', true),
}

/** The five course dimensions, in contract order. */
export const dimensions = ['recommendation', 'quality', 'difficulty', 'workload', 'grading'] as const

/** Ask for one page more than shown so list endpoints without a cursor can tell whether more rows exist. */
export const listSize = 20

type PresentationCache = Map<string, { expires: number; request: Promise<PresentationView> }>
const presentations = new WeakMap<object, PresentationCache>()

/**
 * Catalog, reviews and moderation requests used by the academic pages. Every
 * response is validated against the provider contract before it is typed.
 */
export class AcademicApi {
  constructor(private readonly http: Http, private readonly owner: () => object = () => http) {}

  objects(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/catalog/objects', parse.objectPage, { query, signal })
  }

  filterOptions(kind: 'course' | 'teacher', schoolId?: string, signal?: AbortSignal) {
    return this.http.json('/api/v1/catalog/filter-options', parse.filterOptions, { query: { kind, school_id: schoolId }, signal })
  }

  /**
   * Course or teacher directory rows with department, category, review count, rating bands
   * and heat, plus facet counts under the current filters. The server applies visibility
   * (content state, school, teacher marks); the client only renders what it returns.
   */
  directory(query: Query & { kind: 'course' | 'teacher'; sort?: DirectorySort }, signal?: AbortSignal) {
    return this.http.json('/api/v1/catalog/directory', parse.directory, { query, signal })
  }

  /** The caller's recently visited courses with resource counts (at most 20, kept 90 days). */
  recentCourses(signal?: AbortSignal) {
    return this.http.json('/api/v1/catalog/me/recent-courses', parse.recent, { signal })
  }

  recordRecentCourse(id: string) {
    return this.http.json(`/api/v1/catalog/me/recent-courses/${segment(id)}`, parse.recentRecorded, { method: 'PUT', body: {} })
  }

  clearRecentCourses() {
    return this.http.json('/api/v1/catalog/me/recent-courses', parse.recentCleared, { method: 'DELETE' })
  }

  nextClassDay(signal?: AbortSignal) {
    return this.http.json('/api/v1/catalog/me/next-class-day', parse.nextClassDay, { signal })
  }

  object(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/objects/${segment(id)}`, parse.object, { signal })
  }

  summary(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/objects/${segment(id)}/summary`, parse.summary, { signal })
  }

  /**
   * The object behind a page address: the current short address, an older one, or an
   * internal id. `object.address_id` is the address to show; references keep using the id.
   */
  address(kind: 'course' | 'teacher', address: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/addresses/${kind}/${segment(address)}`, parse.resolution, { signal })
  }

  /** The current object for an id, including an old course id kept after a code change. */
  resolution(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/objects/${segment(id)}/resolution`, parse.resolution, { signal })
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

  /** Only enrollment IDs missing from the public directory need the caller-owned name lookup. */
  async enrollmentReferences(ids: string[], signal?: AbortSignal) {
    const unique = [...new Set(ids)]
    const names = new Map<string, Catalog['schemas']['Reference']>()
    for (let start = 0; start < unique.length; start += 100) {
      const result = await this.http.json('/api/v1/catalog/me/references', parse.enrollmentReferences, {
        query: { ids: unique.slice(start, start + 100).join(',') }, signal,
      })
      for (const item of result.items) names.set(item.id, item)
    }
    return names
  }

  /**
   * Names referenced by the caller's own records, in batches of 100. This works after content
   * admission lapses, so the personal center uses it instead of catalog lookups.
   */
  async references(ids: (string | undefined)[], signal?: AbortSignal): Promise<Map<string, Reference>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))]
    const names = new Map<string, Reference>()
    for (let start = 0; start < unique.length; start += 100) {
      const result = await this.http.json('/api/v1/reviews/me/references', parse.references, { query: { ids: unique.slice(start, start + 100).join(',') }, signal })
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

  /**
   * The caller's enrollments, all pages. The endpoint returns a bare array ordered by id and
   * continues after the last id of a full page, so pages are followed until a short one arrives.
   */
  async myEnrollments(signal?: AbortSignal): Promise<Enrollment[]> {
    const items: Enrollment[] = []
    let after = ''
    for (let page = 0; page < 10; page++) {
      const rows = await this.http.json('/api/v1/catalog/me/enrollments', parse.enrollments, { query: { after: after || undefined, limit: 100, include_term_order: 'true' }, signal })
      items.push(...rows)
      if (rows.length < 100) return items
      const last = rows.at(-1)?.id ?? ''
      if (!last || last === after) throw new ApiError('incompatible')
      after = last
    }
    throw new ApiError('capacity_exceeded')
  }

  /** The caller's active courses of one term with their meetings and the school timetable, all pages. */
  async mySchedule(termId: string, signal?: AbortSignal): Promise<OwnSchedule[]> {
    const items: OwnSchedule[] = []
    let after = ''
    for (let page = 0; page < 10; page++) {
      const result = await this.http.json('/api/v1/catalog/me/schedule', parse.schedule, { query: { term_id: termId, after: after || undefined, limit: 100 }, signal })
      items.push(...result.items)
      if (!result.next) return items
      if (result.next === after) throw new ApiError('incompatible')
      after = result.next
    }
    throw new ApiError('capacity_exceeded')
  }

  /** iCalendar of the whole term. Fails with schedule_incomplete when times or the timetable are missing. */
  async scheduleCalendar(termId: string, signal?: AbortSignal) {
    saveBlob(await this.http.blob('/api/v1/catalog/me/schedule/calendar', 1 << 20, { query: { term_id: termId }, signal }), 'stuhelper-schedule.ics')
  }

  reviews(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews', parse.reviewPage, { query, signal })
  }

  review(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/reviews/${segment(id)}`, parse.review, { query: { include_appends: true }, signal })
  }

  statistics(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/statistics', parse.statistics, { query, signal })
  }

  /**
   * Rating summaries for up to 100 courses or teachers. With charts the response also carries
   * the five-band distribution (relative bar lengths, not counts) and per-term summaries.
   */
  summaries(kind: 'course' | 'teacher', ids: string[], charts: boolean, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/summaries', parse.summaries, { query: { kind, ids: ids.slice(0, 100).join(','), include_charts: charts ? 'true' : undefined }, signal })
  }

  /** The caller's review count, draft count and courses still waiting for a review. */
  overview(signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/overview', parse.overview, { signal })
  }

  composer(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/compose', parse.composer, { query, signal })
  }

  /** Keep successful school labels briefly within the account that read them. */
  presentation(school: string): Promise<PresentationView> {
    const owner = this.owner()
    const cache = presentations.get(owner) ?? new Map<string, { expires: number; request: Promise<PresentationView> }>()
    presentations.set(owner, cache)
    const current = cache.get(school)
    if (current && current.expires > Date.now()) return current.request
    if (cache.size >= 32) cache.delete(cache.keys().next().value!)
    const request = this.http.json('/api/v1/reviews/presentation', parse.presentation, { query: { school_id: school } })
    cache.set(school, { expires: Date.now() + 300_000, request })
    void request.catch(() => { if (cache.get(school)?.request === request) cache.delete(school) })
    return request
  }

  myEntries(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/entries', parse.reviewPage, { query, signal })
  }

  myEntry(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/reviews/me/entries/${segment(id)}`, parse.review, { query: { include_appends: true }, signal })
  }

  myDrafts(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/drafts', parse.drafts, { query, signal })
  }

  draft(id: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/reviews/me/drafts/${segment(id)}`, parse.draft, { signal })
  }

  myVotes(query: Query, signal?: AbortSignal) {
    return this.http.json('/api/v1/reviews/me/votes', parse.ownVotes, { query, signal })
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

  submitTask(submission: Submission, key: string) {
    return this.http.json('/api/v1/moderation/tasks', parse.task, { method: 'POST', body: submission, key })
  }
}

export function useAcademic() {
  const http = useHttp()
  const session = inject(sessionKey, undefined)
  return new AcademicApi(http, () => session?.session.value ?? http)
}

/** Cursor for list endpoints that return a bare array: the last id when the page is full. */
export function arrayCursor<T>(rows: T[], id: (row: T) => string) {
  const last = rows.at(-1)
  return rows.length === listSize && last !== undefined ? id(last) : ''
}

const subjectPrefixes: Partial<Record<ObjectKind, string>> = { course: 'courses', teacher: 'teachers' }

export function subjectPath(object: { id: string; kind: string }) {
  const base = subjectPrefixes[object.kind as ObjectKind]
  return base ? `/${base}/${encodeURIComponent(object.id)}` : ''
}

/** Credits are unknown when absent; zero credits is a real value. */
export function knownCredits(object: Pick<CatalogObject, 'credits'>) {
  return typeof object.credits === 'number' && Number.isFinite(object.credits) ? object.credits : undefined
}
