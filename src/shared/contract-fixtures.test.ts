import { describe, expect, it } from 'vitest'
import billingContract from '../../contracts/billing.openapi.json'
import favoritesContract from '../../contracts/favorites.openapi.json'
import moderationContract from '../../contracts/moderation.openapi.json'
import reviewsContract from '../../contracts/reviews.openapi.json'
import sessionContract from '../../contracts/session.openapi.json'
import { parseContribution } from '../api/contribution'
import { parseCustodyBinding } from '../api/custody'
import { schemaOf } from './api/schema'

describe('contract-checked test fixtures', () => {
  it('validates session, review, draft, moderation, favorite, billing and storage shapes against contracts', () => {
    const parseSession = schemaOf(sessionContract.components.schemas, 'Session')
    const parseReview = schemaOf(reviewsContract.components.schemas, 'View')
    const parseDraft = schemaOf(reviewsContract.components.schemas, 'DraftView')
    const parseTask = schemaOf(moderationContract.components.schemas, 'TaskView')
    const parseFolder = schemaOf(favoritesContract.components.schemas, 'Folder')
    const parseOrder = schemaOf(billingContract.components.schemas, 'Order')

    expect(() => parseSession({
      authenticated: true,
      content_school_id: 'school',
      profile: {
        id: '00000000-0000-4000-8000-000000000001',
        nickname: 'Tester',
        nickname_required: false,
        bio: '',
        visibility: { school: true, badge: true, department: true, grade: false, reviews: true, resources: true },
        group_card_consent: { school: false, grade: false, department: false, name: false, student_id: false, gender: false, nickname: false },
        revision: 1,
      },
      csrf_token: 'a'.repeat(43),
      phone_bound: true,
      administrator: false,
      expires_at: '2030-01-01T00:00:00Z',
    })).not.toThrow()

    expect(() => parseReview({
      id: 'rev-1',
      root_id: 'rev-1',
      kind: 'course',
      school_id: 'school',
      target_id: 'course',
      term_id: 'fall',
      title: 'Structured course',
      body: 'Clear assignments and fair grading.',
      ratings: [4, 4, 3, 3, 4],
      author: { anonymous: true, handle: 'author' },
      revision: 1,
      published_at: '2026-11-01T00:00:00Z',
      upvotes: 3,
      downvotes: 0,
      my_vote: 0,
      mine: true,
      state: 'published',
      can_edit: false,
    })).not.toThrow()

    expect(() => parseDraft({
      id: 'draft-1',
      revision: 2,
      input: {
        kind: 'course',
        target_id: 'course',
        term_id: 'fall',
        teacher_id: 'teacher-a',
        title: 'Withdrawn draft',
        body: 'Needs minor revision.',
        ratings: [4, 4, 3, 3, 4],
        signed: false,
      },
      expires_at: '2030-01-02T00:00:00Z',
      withdrawn: true,
      reference_ids: ['course'],
      reference_state: 'verified',
    })).not.toThrow()

    expect(() => parseTask({
      id: 'task-1',
      school_id: 'school',
      content_kind: 'review',
      submission: {
        object_id: 'rev-1',
        kind: 'edit_request',
        reason: 'Fix semester typo',
        evidence: [],
      },
      object_revision: 1,
      revision: 2,
      state: 'rejected',
      can_appeal: true,
      decision: { id: 'dec-1', object_id: 'rev-1', revision: 1, action: 'dismiss', reason: 'Insufficient detail' },
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-02T00:00:00Z',
    })).not.toThrow()

    expect(() => parseFolder({ id: 'default', name: '', is_default: true, item_count: 1, kind_counts: { course: 1, teacher: 0, resource: 0 }, revision: 1 })).not.toThrow()
    expect(() => parseOrder({
      id: 'ord-1',
      kind: 'membership',
      state: 'failed',
      amount_minor: 0,
      points: 300,
      reference: '',
      channel: '',
      reason: '',
      created_at: '2026-11-10T00:00:00Z',
      allocations: [],
      original_points: 300,
      original_amount_minor: 0,
      receipt_reference: '',
      failure_code: 'payment_expired',
      account: 'points',
      plan_id: 'semester',
    })).not.toThrow()

    // Distinct custody binding ID vs request ID is valid per Storage contract.
    expect(parseCustodyBinding({
      id: 'binding-uuid-1',
      adapter: 'bhpan',
      revision: 1,
      state: 'ready',
      authorization_expires_at: '2030-01-01T00:00:00Z',
      request_id: 'request-uuid-2',
      last_error: '',
    }).id).toBe('binding-uuid-1')

    expect(parseContribution({
      id: 'contrib-1',
      adapter: 'bhpan',
      revision: 1,
      applied_revision: 1,
      desired_state: 'active',
      state: 'active',
      reason: '',
      conditions: { limit_bytes: 10_000_000_000, personal_reserve: 5_000_000_000, until: '2030-01-01T00:00:00Z' },
      consent: { version: 'v1', digest: 'a'.repeat(64), url: 'https://example.invalid/terms' },
      accepted_at: '2026-11-01T00:00:00Z',
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    }).state).toBe('active')
  })
})
