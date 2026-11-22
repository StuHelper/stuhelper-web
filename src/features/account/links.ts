import { AppWindow, BadgeCheck, Bell, Bookmark, CalendarDays, Code2, Coins, FileCheck2, FileText, FolderOpen, HardDrive, Inbox, LockKeyhole, PencilLine, ShieldCheck, ThumbsUp, UserRound, UserRoundCog, UsersRound } from 'lucide-vue-next'
import type { Component } from 'vue'
import { myCoursesEnabled } from '../../app/features'

/**
 * Every page of the personal center, listed once. The desktop side navigation shows
 * them in this order; phones have no side navigation, so the overview page shows the
 * same entries grouped like a settings menu. A page missing here is unreachable on phones.
 */
export interface MeLink {
  to: string
  label: string
  icon: Component
  tile: string
  /** Section of the phone menu. The overview itself is the menu, so it has none. */
  group?: 'content' | 'account' | 'services'
  /** One line under the title in the phone menu. */
  detail?: string
  /** Shown only in the phone menu: the side navigation reaches it through its parent page. */
  phoneOnly?: boolean
}

export const meLinks: MeLink[] = [
  { to: '/me', label: 'me.overview', icon: UserRound, tile: 'var(--c-gray)' },
  { to: '/notifications', label: 'notifications.link', icon: Bell, tile: 'var(--c-red)', group: 'account' },
  ...(myCoursesEnabled ? [{ to: '/me/courses', label: 'courses.title', icon: CalendarDays, tile: 'var(--c-red)', group: 'content' as const, detail: 'me.links.courses' }] : []),
  { to: '/me/reviews', label: 'me.reviews', icon: FileText, tile: 'var(--c-blue)', group: 'content', detail: 'me.links.reviews' },
  { to: '/me/reviews?tab=drafts', label: 'me.reviewTabs.drafts', icon: PencilLine, tile: 'var(--c-orange)', group: 'content', detail: 'me.links.drafts', phoneOnly: true },
  { to: '/me/resources', label: 'me.resources', icon: FolderOpen, tile: 'var(--c-orange)', group: 'content', detail: 'me.links.resources' },
  { to: '/me/requests', label: 'me.requests', icon: Inbox, tile: 'var(--c-indigo)', group: 'content', detail: 'me.links.requests' },
  { to: '/me/verification', label: 'verification.unified.title', icon: ShieldCheck, tile: 'var(--c-green)', group: 'account' },
  { to: '/me/groups', label: 'groups.title', icon: UsersRound, tile: 'var(--c-cyan)', group: 'services' },
  { to: '/me/storage', label: 'nav.contributions', icon: HardDrive, tile: 'var(--c-cyan)', group: 'services', detail: 'me.links.storage' },
  { to: '/me/favorites', label: 'favorites.title', icon: Bookmark, tile: 'var(--c-orange)', group: 'content' },
  { to: '/me/votes', label: 'search.votes.title', icon: ThumbsUp, tile: 'var(--c-blue)', group: 'content' },
  { to: '/me/wallet', label: 'wallet.title', icon: Coins, tile: 'var(--c-flame)', group: 'services' },
  { to: '/me/membership', label: 'membership.title', icon: BadgeCheck, tile: 'var(--c-indigo)', group: 'services' },
  { to: '/me/apps', label: 'platform.grants.title', icon: AppWindow, tile: 'var(--c-cyan)', group: 'services' },
  { to: '/me/developer', label: 'platform.developer.title', icon: Code2, tile: 'var(--c-gray)', group: 'services' },
  { to: '/me/profile', label: 'profile.title', icon: UserRoundCog, tile: 'var(--c-pink)', group: 'account' },
  { to: '/me/account', label: 'security.title', icon: LockKeyhole, tile: 'var(--c-gray)', group: 'account' },
  { to: '/me/privacy', label: 'privacy.title', icon: FileCheck2, tile: 'var(--c-indigo)', group: 'account', detail: 'me.links.privacy' },
]

/** Phone menu sections in display order, with the message key of each heading. */
export const meGroups = [
  { id: 'content', title: 'me.content' },
  { id: 'account', title: 'me.groups.account' },
  { id: 'services', title: 'me.groups.services' },
] as const
