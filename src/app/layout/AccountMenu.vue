<script setup lang="ts">
import { Bookmark, CalendarDays, CircleAlert, FileText, FolderOpen, LogOut, Settings, ShieldCheck } from 'lucide-vue-next'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useAccess } from '../../features/account/access'
import SessionNotice from '../../shared/ui/SessionNotice.vue'
import { useSession } from '../../shared/session'
import { useLinkAvailable } from '../../shared/capabilities'

// Frequent personal pages and the account's standing. Everything else lives in
// the personal center. Content links stay hidden until the account may open them.
const { t, locale } = useI18n()
const session = useSession()
const access = useAccess()
const router = useRouter()
const available = useLinkAvailable()
const statusKey = computed(() => ({ verified: 'account.status.verified', unverified: 'account.status.unverified', processing: 'account.status.processing', expired: 'account.status.expired', unavailable: 'me.status.unknown', guest: '', loading: '' }[access.state.value]))
const nextStep = computed(() => ({ unverified: 'gate.unverified.action', processing: 'gate.processing.action', expired: 'gate.expired.action' } as Record<string, string>)[access.state.value])
const content = computed(() => [
  { to: '/me/courses', label: 'courses.title', icon: CalendarDays },
  { to: '/me/favorites', label: 'account.menu.favorites', icon: Bookmark },
  { to: '/me/reviews', label: 'me.reviews', icon: FileText },
  { to: '/me/resources', label: 'me.resources', icon: FolderOpen },
])

async function signOut() {
  try {
    await session.signOut(false)
  } catch {
    // The personal center shows sign-out failures and offers another try.
    void router.push('/me')
  }
}
</script>

<template>
  <SessionNotice />
  <DropdownMenuRoot
    v-if="session.state.value === 'member' && session.session.value"
    :modal="false"
    :dir="locale === 'ar-EG' ? 'rtl' : 'ltr'"
  >
    <DropdownMenuTrigger
      class="avatar"
      :aria-label="t('nav.account')"
    >
      <span aria-hidden="true">{{ [...session.session.value.profile.nickname][0] }}</span>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="menu"
        align="end"
        :side-offset="8"
      >
        <DropdownMenuItem as-child>
          <RouterLink
            class="menu-item menu-head"
            to="/me"
          >
            <span class="menu-name truncate">{{ session.session.value.profile.nickname }}</span>
            <small v-if="statusKey">{{ t(statusKey) }}</small>
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="menu-sep" />
        <template v-if="access.state.value === 'verified'">
          <DropdownMenuItem
            v-for="link in content.filter((item) => available(item.to))"
            :key="link.to"
            as-child
          >
            <RouterLink
              class="menu-item"
              :to="link.to"
            >
              <component
                :is="link.icon"
                aria-hidden="true"
              />{{ t(link.label) }}
            </RouterLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-sep" />
        </template>
        <template v-else-if="nextStep">
          <DropdownMenuItem as-child>
            <RouterLink
              class="menu-item menu-next"
              to="/me/verification"
            >
              <ShieldCheck aria-hidden="true" />{{ t(nextStep) }}
            </RouterLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="menu-sep" />
        </template>
        <DropdownMenuItem as-child>
          <RouterLink
            class="menu-item"
            :to="'/me/account'"
          >
            <Settings aria-hidden="true" />{{ t('account.menu.settings') }}
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="menu-sep" />
        <DropdownMenuItem
          class="menu-item"
          @select="signOut"
        >
          <LogOut aria-hidden="true" />{{ t('account.menu.signOut') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
  <button
    v-else-if="session.state.value === 'guest'"
    class="btn btn-sm btn-primary"
    type="button"
    @click="session.signIn"
  >
    {{ t('account.signIn') }}
  </button>
  <button
    v-else-if="session.state.value === 'error'"
    class="btn btn-sm account-error"
    type="button"
    :aria-label="t('account.reload')"
    :title="t('account.unavailable')"
    @click="session.reload"
  >
    <CircleAlert aria-hidden="true" />
    <span class="account-error-text">{{ t('account.reloadShort') }}</span>
  </button>
</template>

<style scoped>
.avatar { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; background: linear-gradient(145deg, #6f8dff, #2d5bff); color: #fff; font: inherit; font-size: .875rem; font-weight: 600; cursor: pointer; transition: transform .3s var(--spring); }
.avatar:active { transform: scale(.92); }
.account-error svg { color: var(--warning); }
@media (max-width: 480px) { .account-error-text { display: none; } }
</style>
<style>
/* The menu is teleported out of this component, so these rules cannot be scoped. */
.menu-item.menu-head { display: grid; gap: 1px; justify-items: start; }
.menu-head .menu-name { font-weight: 600; }
.menu-head small { color: var(--label-3); font-size: .75rem; }
.menu-head[data-highlighted] small, .menu-head:hover small { color: inherit; }
.menu-item.menu-next { color: var(--accent); font-weight: 550; }
.menu-item.menu-next[data-highlighted], .menu-item.menu-next:hover { color: var(--accent); }
.menu-item.menu-next svg, .menu-item.menu-next:hover svg { color: var(--accent); }
</style>
