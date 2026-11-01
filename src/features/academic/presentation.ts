import { ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { dimensions, useAcademic, type PresentationView, type Review } from './api'

/**
 * Rating labels for a school. The school may configure its own wording per
 * language; otherwise the built-in five-level wording applies.
 */
export function useRatingText(school: Ref<string | undefined>) {
  const { t, locale } = useI18n()
  const api = useAcademic()
  const configured = ref<PresentationView>()
  watch(school, async (id) => {
    configured.value = undefined
    if (!id) return
    try {
      const value = await api.presentation(id)
      if (school.value === id) configured.value = value
    } catch {
      // Built-in wording remains available when the configuration cannot load.
    }
  }, { immediate: true })
  return (dimension: number, level: number) => {
    const custom = configured.value?.effective.rating_texts[locale.value]?.[dimension]?.[level]
    if (custom) return custom
    const name = dimensions[dimension] ?? 'recommendation'
    return level === 0 ? t(`academic.ratings.${name}.label`) : t(`academic.ratings.${name}.level${level}`)
  }
}

/** Public author label. Anonymous participants keep a short per-thread handle. */
export function useAuthorName() {
  const { t } = useI18n()
  return (review: Pick<Review, 'author'>) => {
    const realName = review.author.disclosures?.find((option) => option.key === 'real_name')?.value
    if (realName) return realName
    if (review.author.anonymous) return review.author.handle === 'author' ? t('academic.author.anonymous') : t('academic.author.anonymousHandle', { handle: review.author.handle.slice(0, 6) })
    return review.author.profile?.name ?? t('common.unknown')
  }
}

/** Only http(s) avatar URLs are rendered. */
export function safeAvatar(value: string | undefined) {
  if (!value) return ''
  try {
    const url = new URL(value, location.origin)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

/** Own entries that are not public open in the personal area; others open in the discussion. */
export function reviewLink(review: Pick<Review, 'id' | 'root_id' | 'mine' | 'state'>) {
  if (review.mine && review.state !== 'published') return `/me/reviews/entries/${encodeURIComponent(review.id)}`
  const hash = review.id === review.root_id ? '' : `#review-${review.id}`
  return `/reviews/${encodeURIComponent(review.root_id)}${hash}`
}

const stateTones: Record<string, 'success' | 'warning' | 'danger'> = { published: 'success', pending: 'warning', withdrawn: 'warning', hidden: 'danger', deleted: 'danger' }

export function stateTone(state: string) {
  return stateTones[state] ?? 'neutral'
}
