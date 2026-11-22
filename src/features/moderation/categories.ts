import type { components } from '../../api/moderation.gen'

export type ViolationCategory = components['schemas']['ViolationCategory']

/** Display order follows the moderation contract: unlawful, personal, rights, campus, quality. */
export const violationCategories: readonly ViolationCategory[] = [
  'illegal_content', 'pornography', 'gambling_drugs', 'fraud', 'violence_threat', 'minors_harm',
  'personal_attack', 'harassment_discrimination', 'defamation_rumor', 'privacy_leak', 'impersonation',
  'copyright', 'other_ip',
  'academic_integrity', 'leaked_exam', 'fake_review', 'wrong_teacher',
  'wrong_info', 'spam', 'malware', 'duplicate', 'low_quality',
  'author_update', 'other',
]
