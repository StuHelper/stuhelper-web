<script setup lang="ts">
import { AppWindow, Bookmark, CalendarDays, Code2, Coins, FileText, FolderOpen, GraduationCap, HardDrive, Inbox, LockKeyhole, ShieldCheck, UserRound, UserRoundCog } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import RequireSignIn from './RequireSignIn.vue'

// Shared frame of the personal center: one heading, section links and the
// sign-in boundary for private pages.
withDefaults(defineProps<{ title: string; description?: string; requireSignIn?: boolean; back?: string; backLabel?: string }>(), { description: '', requireSignIn: true, back: undefined, backLabel: undefined })
const { t } = useI18n()
const route = useRoute()
const covers = (to: string) => route.path === to || (to !== '/me' && route.path.startsWith(`${to}/`))
// The most specific link wins, so the teacher page does not also mark the verification link.
const current = (to: string) => covers(to) && !links.some((link) => link.to !== to && link.to.startsWith(`${to}/`) && covers(link.to))
const links = [
  { to: '/me', label: 'me.overview', icon: UserRound, tile: 'var(--c-gray)' },
  { to: '/me/courses', label: 'courses.title', icon: CalendarDays, tile: 'var(--c-red)' },
  { to: '/me/reviews', label: 'me.reviews', icon: FileText, tile: 'var(--c-blue)' },
  { to: '/me/resources', label: 'me.resources', icon: FolderOpen, tile: 'var(--c-orange)' },
  { to: '/me/requests', label: 'me.requests', icon: Inbox, tile: 'var(--c-indigo)' },
  { to: '/me/verification', label: 'verification.title', icon: ShieldCheck, tile: 'var(--c-green)' },
  { to: '/me/verification/teacher', label: 'teacher.link', icon: GraduationCap, tile: 'var(--c-indigo)' },
  { to: '/me/storage', label: 'nav.contributions', icon: HardDrive, tile: 'var(--c-cyan)' },
  { to: '/me/favorites', label: 'favorites.title', icon: Bookmark, tile: 'var(--c-orange)' },
  { to: '/me/wallet', label: 'wallet.title', icon: Coins, tile: 'var(--c-flame)' },
  { to: '/me/apps', label: 'platform.grants.title', icon: AppWindow, tile: 'var(--c-cyan)' },
  { to: '/me/developer', label: 'platform.developer.title', icon: Code2, tile: 'var(--c-gray)' },
  { to: '/me/profile', label: 'profile.title', icon: UserRoundCog, tile: 'var(--c-pink)' },
  { to: '/me/account', label: 'security.title', icon: LockKeyhole, tile: 'var(--c-gray)' },
] as const
</script>

<template>
  <div class="me">
    <nav
      class="me-nav"
      :aria-label="t('me.title')"
    >
      <p class="me-nav-title">
        {{ t('me.title') }}
      </p>
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :aria-current="current(link.to) ? 'page' : undefined"
      >
        <span
          class="icon-tile"
          :style="{ '--tile': link.tile }"
        ><component
          :is="link.icon"
          aria-hidden="true"
        /></span>
        <span class="truncate">{{ t(link.label) }}</span>
      </RouterLink>
    </nav>
    <div class="stack-lg me-content">
      <PageHeader
        :title="title"
        :description="description"
        :back="back ?? (route.path === '/me' ? undefined : '/me')"
        :back-label="backLabel ?? t('me.title')"
      >
        <template
          v-if="$slots.actions"
          #actions
        >
          <slot name="actions" />
        </template>
      </PageHeader>
      <RequireSignIn v-if="requireSignIn">
        <slot />
      </RequireSignIn>
      <slot v-else />
    </div>
  </div>
</template>

<style scoped>
.me { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: clamp(1.5rem, 4vw, 3.5rem); align-items: start; }
.me-nav { position: sticky; inset-block-start: calc(var(--nav-height) + 1.5rem); display: grid; gap: 2px; }
.me-nav-title { padding: 0 .625rem .625rem; color: var(--label-3); font-size: .8125rem; font-weight: 550; }
.me-nav a { display: flex; align-items: center; gap: .625rem; min-height: 42px; padding: .375rem .625rem; border-radius: var(--radius-sm); color: var(--label); font-size: .9375rem; transition: background-color .15s; }
.me-nav a:hover { background: var(--fill); text-decoration: none; }
.me-nav a[aria-current="page"] { background: var(--fill-strong); font-weight: 550; }
.me-nav .icon-tile { width: 26px; height: 26px; border-radius: 7px; }
.me-nav .icon-tile svg { width: 16px; height: 16px; }
/* On phones the overview page is the menu, as in iOS Settings. */
/* 桌面端侧栏一直可见，不需要返回个人中心的链接。 */
@media (min-width: 761px) { .me-content > :deep(.page-header > .page-back[href="/me"]) { display: none; } }
@media (max-width: 760px) {
  .me { grid-template-columns: minmax(0, 1fr); }
  .me-nav { display: none; }
}
</style>
