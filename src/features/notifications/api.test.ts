import { describe, expect, it } from 'vitest'
import contract from '../../../contracts/notifications.openapi.json'
import { boxOf, type TitleKey } from './api'

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
      'system.notice': 'system',
      'system.security': 'system',
      'system.account': 'system',
    })
  })
})
