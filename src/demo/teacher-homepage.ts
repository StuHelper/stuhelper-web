import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import catalogContract from '../../contracts/catalog.openapi.json'
import moderationContract from '../../contracts/moderation.openapi.json'
import type { components as Catalog } from '../api/catalog.gen'
import type { components as Moderation } from '../api/moderation.gen'
import { photoLimit, textLimit } from '../features/academic/teacherHomepage'
import { schemaOf, type Validator } from '../shared/api/schema'
import { SCHOOL, ago, teachers } from './data'
import { teacherCredentials } from './teacher'
import researchImage from './teacher-body-image.png?inline'
import portrait from './teacher-portrait.png?inline'

type C = Catalog['schemas']
type Task = Moderation['schemas']['TaskView']
type HomepageRequest = C['TeacherHomepageRequest']
type RequestInput = C['TeacherHomepageRequestInput']
type Complaint = Moderation['schemas']['TeacherHomepageComplaint']

function base64Bytes(data: string) {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < bytes.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const photoBytes = base64Bytes(portrait.slice(portrait.indexOf(',') + 1))
const photoId = bytesToHex(sha256(photoBytes))
const photoType = 'image/png'
const profilePhoto = { content_type: photoType, width: 128, height: 160 } as const
const bodyImageBytes = base64Bytes(researchImage.slice(researchImage.indexOf(',') + 1))
const bodyImageId = bytesToHex(sha256(bodyImageBytes))
const bodyImageMetadata: C['TeacherHomepageBodyImage'] = { content_type: photoType, width: 640, height: 360, size_bytes: bodyImageBytes.length }
const bodyImages = new Map([[bodyImageId, { bytes: bodyImageBytes, metadata: bodyImageMetadata }]])
const teachingPage = 'https://teachers.example.invalid/lin/teaching'
const publishedMedia = new Map<string, C['TeacherHomepageMedium'][]>([
  ['p1', [
    {
      kind: 'image', field: 'research', title: '数值方法收敛曲线',
      url: `/api/v1/catalog/objects/p1/teacher-homepage/images/${bodyImageId}`, image: bodyImageMetadata,
    },
    { kind: 'image', field: 'sections', section: '近期教学', title: '课堂板书示例', url: teachingPage },
    { kind: 'video', field: 'sections', section: '教学媒体', url: `${teachingPage}/video` },
    { kind: 'attachment', field: 'sections', section: '教学媒体', url: `${teachingPage}/worksheet.pdf` },
  ]],
])
const profiles = new Map<string, C['TeacherHomepagePublicProfile']>([
  ['p1', {
    name: '林知远',
    position: '数学与应用数学专业教学负责人',
    education: '研究生',
    degree: '博士',
    discipline: '数学',
    supervisors: ['博士生导师', '硕士生导师'],
    email: 'lin@example.invalid',
    office_location: '理科楼 302',
    hire_date: '2014 年 9 月',
    biography: '主要讲授高等数学和数学分析。\n本科教学关注理论与计算实践的结合。',
    research: '偏微分方程的数值计算与误差分析。',
    fields: [{ label: '办公室答疑', value: '周三 15:00–16:00' }],
    sections: [{ title: '近期教学', text: '数学分析\n偏微分方程数值方法' }],
    photo: { ...profilePhoto, url: `/api/v1/catalog/objects/p1/teacher-homepage/photos/${photoId}` },
  }],
  ['p2', {
    name: '周清和',
    discipline: '计算数学',
    supervisors: ['硕士生导师'],
    biography: '讲授线性代数和数值计算。',
    research: '大规模矩阵分解。',
    fields: [],
    sections: [],
  }],
])

// The prototype has one demo account. Changes last for the current page session.
const requests: HomepageRequest[] = [
  { id: 'demo-homepage-pending', teacher_id: 'p2', kind: 'supplement', field: { field: 'fields', label: '答疑时间' }, value: { text: '周四 14:00–16:00' }, message: '请补充本学期的答疑时间。', status: 'pending', revision: 1, created_at: ago(1) },
  { id: 'demo-homepage-approved', teacher_id: 'p2', kind: 'correction', field: { field: 'research' }, value: { text: '大规模矩阵分解。' }, message: '请更新目前的研究方向。', status: 'approved', revision: 2, created_at: ago(5), resolved_at: ago(3), resolution_note: '已更新研究方向。' },
  { id: 'demo-homepage-rejected', teacher_id: 'p2', kind: 'hide', field: { field: 'discipline' }, message: '请隐藏学科信息。', status: 'rejected', revision: 2, created_at: ago(10), resolved_at: ago(8), resolution_note: '请说明学科信息需要隐藏的原因。' },
]

const parseProposal = schemaOf<RequestInput>(catalogContract.components.schemas, 'TeacherHomepageRequestInput')
const parseComplaint = schemaOf<Complaint>(moderationContract.components.schemas, 'TeacherHomepageComplaint')
const privateCache = 'private, no-store'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': privateCache },
})
const error = (code: string, status: number) => json({ code, request_id: 'demo' }, status)
const invalid = () => error('invalid_input', 400)
const missing = () => error('not_found', 404)
const teacherExists = (id: string) => teachers.some((teacher) => teacher.id === id)

function readInput<T>(body: string, parse: Validator<T>) {
  try {
    return parse(JSON.parse(body) as unknown)
  } catch {
    return undefined
  }
}

async function photoMetadata(photo: C['TeacherHomepagePortraitUpload']): Promise<C['TeacherHomepagePortrait'] | undefined> {
  try {
    const bytes = base64Bytes(photo.data)
    const png = [137, 80, 78, 71, 13, 10, 26, 10]
    const jpeg = [255, 216, 255]
    const signature = photo.content_type === photoType ? png : jpeg
    if (bytes.length > photoLimit || !signature.every((byte, index) => bytes[index] === byte)) return undefined
    const bitmap = await createImageBitmap(new Blob([bytes], { type: photo.content_type }))
    const { width, height } = bitmap
    bitmap.close()
    if (Math.max(width, height) > 4096 || width * height > 8_388_608) return undefined
    return { id: bytesToHex(sha256(bytes)), content_type: photo.content_type, width, height }
  } catch {
    return undefined
  }
}

async function requestValue({ field: { field, label }, value }: RequestInput): Promise<HomepageRequest['value']> {
  if (!value || field === 'page') return undefined
  if (field === 'photo') {
    const photo = value.photo && await photoMetadata(value.photo)
    return photo && { photo }
  }
  if (field === 'supervisors') return value.supervisors && { supervisors: value.supervisors }
  if (field === 'fields' && !label) return value.fields && { fields: value.fields }
  if (field === 'sections' && !label) return value.sections && { sections: value.sections }
  const text = value.text?.trim()
  if (text && [...text].length <= textLimit(field, !!label)) return { text }
  return undefined
}

type Replay = { fingerprint: string; createdAt: number; value: HomepageRequest | Task }
const requestReplays = new Map<string, Replay>()
const complaintReplays = new Map<string, Replay>()

function save(replays: Map<string, Replay>, key: string, scope: string, body: string, create: () => Replay['value']) {
  if (!key.trim() || !/^[ -~]{1,128}$/.test(key)) return invalid()
  const fingerprint = bytesToHex(sha256(new TextEncoder().encode(body)))
  const replayKey = JSON.stringify([scope, key])
  const prior = replays.get(replayKey)
  if (prior) return prior.fingerprint === fingerprint ? json(prior.value) : error('conflict', 409)
  const createdAt = Date.now()
  const recent = [...replays.values()].filter((entry) => entry.createdAt > createdAt - 60_000)
  if (recent.length >= 10) return error('rate_limited', 429)
  const value = create()
  replays.set(replayKey, { fingerprint, createdAt, value })
  return json(value)
}

function listRequests(teacherId: string, query: URLSearchParams) {
  const limit = Number(query.get('limit') ?? '20')
  const status = query.get('status') ?? 'all'
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !['all', 'pending', 'approved', 'rejected'].includes(status)) return invalid()
  const rows = requests.filter((item) => item.teacher_id === teacherId && (status === 'all' || status === item.status))
  const after = query.get('after')
  const start = after ? rows.findIndex((item) => item.id === after) + 1 : 0
  if (after && !start) return invalid()
  const items = rows.slice(start, start + limit)
  return json({ items, total: rows.length, next: start + limit < rows.length ? items.at(-1)?.id ?? '' : '' })
}

function readMedia(path: string, method: string, verified: boolean): Response | undefined {
  const matched = /^\/catalog\/objects\/([^/]+)\/teacher-homepage\/(?:media|images\/([^/]+))$/.exec(path)
  if (!matched) return undefined
  const [, encodedTeacherId, encodedImageId] = matched
  if (method !== 'GET' && !(method === 'HEAD' && encodedImageId)) return missing()

  let teacherId: string
  let imageId: string
  try {
    teacherId = decodeURIComponent(encodedTeacherId!)
    imageId = decodeURIComponent(encodedImageId ?? '')
  } catch {
    return invalid()
  }
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(teacherId) || (encodedImageId && !/^[\da-f]{64}$/.test(imageId))) return invalid()
  if (!verified) return error('forbidden', 403)
  if (!teacherExists(teacherId)) return missing()

  const items = publishedMedia.get(teacherId) ?? []
  if (!encodedImageId) return json({ items } satisfies C['TeacherHomepageMediaView'])
  const asset = bodyImages.get(imageId)
  if (!asset || !items.some((item) => 'image' in item && item.url.endsWith(`/${imageId}`))) return missing()
  return new Response(method === 'HEAD' ? null : asset.bytes, {
    headers: {
      'Content-Type': asset.metadata.content_type,
      'Content-Length': String(asset.metadata.size_bytes),
      'Cache-Control': privateCache,
      'X-Content-Type-Options': 'nosniff',
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function teacherHomepageRoute(
  path: string, method: string, query: URLSearchParams, verified: boolean, init: RequestInit | undefined,
  addComplaint: (task: Task) => void,
): Promise<Response | undefined> {
  const media = readMedia(path, method, verified)
  if (media) return media

  const receipt = /^\/catalog\/me\/teacher-homepage\/requests\/([\w.:-]+)$/.exec(path)
  if (receipt && method === 'GET') {
    const request = requests.find((item) => item.id === receipt[1])
    if (!request) return missing()
    return ownsTeacher(request.teacher_id, verified) ? json(request) : error('forbidden', 403)
  }

  const homepage = /^\/catalog\/objects\/([\w.:-]+)\/teacher-homepage(?:\/(requests|photos\/[\da-f]{64}))?$/.exec(path)
  if (homepage) {
    const [, id, tail] = homepage
    const teacherId = id!
    if (tail !== 'requests' && !verified) return error('verification_required', 403)
    if (!teacherExists(teacherId)) return missing()
    if (tail === 'requests') {
      if (!ownsTeacher(teacherId, verified)) return error('forbidden', 403)
      if (method === 'GET') return listRequests(teacherId, query)
      if (method === 'POST') return submitRequest(teacherId, init)
    } else if (method === 'GET') {
      const profile = profiles.get(teacherId)
      if (!tail) {
        if (!profile || query.get('reveal_contacts') === 'true') return json({ profile })
        const { email, phone, office_location, ...initial } = profile
        return json({ profile: initial, contacts_available: !!(email || phone || office_location) } satisfies C['TeacherHomepagePublicView'])
      }
      if (profile?.photo?.url !== '/api/v1' + path) return missing()
      return new Response(photoBytes, { headers: { 'Content-Type': photoType, 'Cache-Control': 'no-store' } })
    }
    return missing()
  }

  const complaintPath = /^\/moderation\/teacher-homepage-complaints\/([\w.:-]+)$/.exec(path)
  if (complaintPath && method === 'POST') {
    const teacherId = complaintPath[1]!
    if (!profiles.has(teacherId)) return missing()
    const body = String(init?.body ?? '')
    const input = readInput(body, parseComplaint)
    if (!input || !input.reason.trim() || input.evidence.some((item) => !item.trim())) return invalid()
    const key = new Headers(init?.headers).get('Idempotency-Key') ?? ''
    return save(complaintReplays, key, teacherId, JSON.stringify([input.category, input.reason, input.evidence]), () => {
      const at = new Date().toISOString()
      const task: Task = {
        id: `demo-homepage-complaint-${complaintReplays.size + 1}`, school_id: SCHOOL, content_kind: 'teacher_homepage',
        submission: { ...input, object_id: `teacher-homepage:${teacherId}`, kind: 'report' },
        object_revision: 1, revision: 1, state: 'waiting', created_at: at, updated_at: at,
      }
      addComplaint(task)
      return task
    })
  }
  return undefined
}

function ownsTeacher(teacherId: string, verified: boolean) {
  return teacherCredentials(verified).some((item) => item.state === 'active' && item.teacher_ids.includes(teacherId))
}

async function submitRequest(teacherId: string, init?: RequestInit) {
  const body = String(init?.body ?? '')
  const input = readInput(body, parseProposal)
  if (!input || !input.message.trim() || (input.field.label && !['fields', 'sections'].includes(input.field.field))) return invalid()
  const value = await requestValue(input)
  if (input.kind === 'hide' ? input.value !== undefined : !value) return invalid()
  const key = new Headers(init?.headers).get('Idempotency-Key') ?? ''
  return save(requestReplays, key, teacherId, JSON.stringify([input.kind, input.field, value, input.message.trim()]), () => {
    const request: HomepageRequest = {
      id: `demo-homepage-request-${requestReplays.size + 1}`, teacher_id: teacherId,
      kind: input.kind, field: input.field, ...(value && { value }), message: input.message.trim(),
      status: 'pending', revision: 1, created_at: new Date().toISOString(),
    }
    requests.unshift(request)
    return request
  })
}
