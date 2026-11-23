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

/** The same categories in contract order, grouped for the picker. */
export const violationGroups: readonly { id: 'unlawful' | 'personal' | 'rights' | 'campus' | 'quality'; categories: readonly ViolationCategory[] }[] = [
  { id: 'unlawful', categories: violationCategories.slice(0, 6) },
  { id: 'personal', categories: violationCategories.slice(6, 11) },
  { id: 'rights', categories: violationCategories.slice(11, 13) },
  { id: 'campus', categories: violationCategories.slice(13, 17) },
  { id: 'quality', categories: violationCategories.slice(17) },
]
