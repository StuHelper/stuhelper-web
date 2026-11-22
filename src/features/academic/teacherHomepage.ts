import catalogContract from '../../../contracts/catalog.openapi.json'
import moderationContract from '../../../contracts/moderation.openapi.json'
import type { components as Catalog } from '../../api/catalog.gen'
import type { components as Moderation } from '../../api/moderation.gen'
import { segment, type Http } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useHttp } from '../../shared/session'

type C = Catalog['schemas']
export type HomepageView = C['TeacherHomepagePublicView']
export type HomepageProfile = C['TeacherHomepagePublicProfile']
export type HomepageRequest = C['TeacherHomepageRequest']
export type HomepageRequestInput = C['TeacherHomepageRequestInput']
export type HomepageField = C['TeacherHomepageFieldSelector']['field']
export type HomepageRequestKind = HomepageRequestInput['kind']
export type Supervisor = C['TeacherHomepageSupervisor']
export type Complaint = Moderation['schemas']['TeacherHomepageComplaint']

const catalog = catalogContract.components.schemas
const moderation = moderationContract.components.schemas
const parse = {
  view: schemaOf<HomepageView>(catalog, 'TeacherHomepagePublicView'),
  request: schemaOf<HomepageRequest>(catalog, 'TeacherHomepageRequest'),
  requests: schemaOf<C['TeacherHomepageRequestPage']>(catalog, 'TeacherHomepageRequestPage'),
  task: schemaOf<Moderation['schemas']['TaskView']>(moderation, 'TaskView'),
}

/** Photos are JPEG or PNG of at most 2 MiB, read with the reader's session. */
export const photoLimit = 2 * 1024 * 1024
/** Fixed text fields a request may change, in the order the page shows them. */
export const textFields = ['name', 'position', 'education', 'degree', 'discipline', 'email', 'phone', 'office_location', 'hire_date', 'biography', 'research'] as const
/** Every field a teacher may ask about; `page` only asks to hide the whole page. */
export const requestFields: readonly HomepageField[] = [...textFields, 'supervisors', 'fields', 'sections', 'photo', 'page']
export const supervisorOptions: readonly Supervisor[] = ['博士生导师', '硕士生导师']
/** Message key of a supervisor role; the contract values are the official Chinese wording. */
export const supervisorKey = (value: Supervisor) => (value === '博士生导师' ? 'doctoral' : 'master')
/** Longest text the server accepts for each field (code points). */
export function textLimit(field: HomepageField, labelled: boolean) {
  if (field === 'name') return 256
  if (field === 'biography' || field === 'research' || (field === 'sections' && labelled)) return 16_000
  if (field === 'fields' && labelled) return 1024
  return 512
}

/**
 * The official homepage shown on a teacher page, the teacher's own correction requests and
 * other readers' complaints. The server applies the school allowlist, the teacher's controls
 * and the match state; the page shows only what it returns, always as plain text.
 */
export class TeacherHomepageApi {
  constructor(private readonly http: Http) {}

  homepage(teacherId: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/objects/${segment(teacherId)}/teacher-homepage`, parse.view, { signal })
  }

  /** The photo through its same-origin address; the contract fixes the address pattern. */
  photo(url: string, signal?: AbortSignal) {
    return this.http.blob(url, photoLimit, { signal, redirect: 'error' })
  }

  async myRequests(teacherId: string, after: string, signal?: AbortSignal) {
    const page = await this.http.json(`/api/v1/catalog/objects/${segment(teacherId)}/teacher-homepage/requests`, parse.requests, { query: { after: after || undefined, limit: 20 }, signal })
    return { items: page.items, next: page.next }
  }

  submitRequest(teacherId: string, body: HomepageRequestInput, key: string) {
    return this.http.json(`/api/v1/catalog/objects/${segment(teacherId)}/teacher-homepage/requests`, parse.request, { method: 'POST', body, key, timeout: 60_000 })
  }

  myRequest(requestId: string, signal?: AbortSignal) {
    return this.http.json(`/api/v1/catalog/me/teacher-homepage/requests/${segment(requestId)}`, parse.request, { signal })
  }

  complain(teacherId: string, body: Complaint, key: string) {
    return this.http.json(`/api/v1/moderation/teacher-homepage-complaints/${segment(teacherId)}`, parse.task, { method: 'POST', body, key })
  }
}

export function useTeacherHomepage() {
  return new TeacherHomepageApi(useHttp())
}

/** Standard base64 of a file's bytes, as the request body carries a replacement photo. */
export async function base64Of(file: Blob) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}
