import { describe, expect, it } from 'vitest'
import contract from '../../../contracts/notifications.openapi.json'
import { boxOf, targetRoute, type Notification, type TitleKey } from './api'

describe('boxOf', () => {
  it('files every title of the contract in the box of its subject', () => {
    const filed = Object.fromEntries((contract.components.schemas.TitleKey.enum as TitleKey[]).map((title_key) => [title_key.slice('notifications.'.length), boxOf({ title_key })]))
    expect(filed).toEqual({
      'interaction.reply': 'interaction',
      'interaction.like': 'interaction',
      'content.approved': 'review',
      'content.rejected': 'review',
      'content.removed': 'review',
      'resource_removal.approved': 'review',
      'resource_removal.rejected': 'review',
      'report.approved': 'review',
      'report.rejected': 'review',
      'student_verification.approved': 'verification',
      'student_verification.rejected': 'verification',
      'student_verification.revoked': 'verification',
      'identity_verification.approved': 'verification',
      'identity_verification.rejected': 'verification',
      'verification_revocation.approved': 'verification',
      'verification_revocation.rejected': 'verification',
      'verification_deletion.approved': 'verification',
      'verification_deletion.rejected': 'verification',
      'teacher_verification.approved': 'verification',
      'teacher_verification.rejected': 'verification',
      'content.draft_expiring': 'review',
      'appeal.approved': 'review',
      'appeal.rejected': 'review',
      'teacher_homepage_request.approved': 'review',
      'teacher_homepage_request.rejected': 'review',
      'student_verification.supplement_required': 'verification',
      'teacher_verification.supplement_required': 'verification',
      'group_membership.grace_expiring': 'system',
      'storage_contribution.exit_completed': 'system',
      'billing.topup_review_required': 'system',
      'billing.refund_completed': 'system',
      'billing.refund_rejected': 'system',
      'system.notice': 'system',
      'system.security': 'system',
      'system.account': 'system',
    })
  })
})

describe('targetRoute', () => {
  const at = (kind: Notification['target']['kind'], title_params: Record<string, string> = {}) => targetRoute({ target: { kind, id: 'x1' }, title_params } as Pick<Notification, 'target' | 'title_params'>)
  it('opens the root review of a comment when the server names it, and the content page otherwise', () => {
    expect(at('comment', { content_id: 'c1', context_id: 'root-1' })).toBe('/reviews/root-1')
    expect(at('comment', { content_id: 'c1' })).toBe('/me/reviews')
    expect(at('comment', { context_id: '../admin' })).toBe('/me/reviews')
    // Only comments use the root review; a review opens itself.
    expect(at('review', { context_id: 'other' })).toBe('/reviews/x1')
  })
  it('sends the new result kinds to the pages that list them', () => {
    expect(at('moderation_appeal')).toBe('/me/reviews')
    expect(at('group_membership')).toBe('/me/groups')
    expect(at('storage_contribution')).toBe('/me/storage')
    expect(at('billing_order')).toBe('/me/wallet')
  })
})
