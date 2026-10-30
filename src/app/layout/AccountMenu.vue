<script setup lang="ts">
import { CircleAlert, FileText, FolderOpen, ShieldCheck, UserRound } from 'lucide-vue-next'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useSession } from '../../shared/session'

const { t, locale } = useI18n()
const session = useSession()
</script>

<template>
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
        <DropdownMenuLabel class="menu-label truncate">
          {{ session.session.value.profile.nickname }}
        </DropdownMenuLabel>
        <DropdownMenuSeparator class="menu-sep" />
        <DropdownMenuItem as-child>
          <RouterLink
            class="menu-item"
            to="/me"
          >
            <UserRound aria-hidden="true" />{{ t('me.title') }}
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child>
          <RouterLink
            class="menu-item"
            to="/me/reviews"
          >
            <FileText aria-hidden="true" />{{ t('me.reviews') }}
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child>
          <RouterLink
            class="menu-item"
            to="/me/resources"
          >
            <FolderOpen aria-hidden="true" />{{ t('me.resources') }}
          </RouterLink>
        </DropdownMenuItem>
        <DropdownMenuItem as-child>
          <RouterLink
            class="menu-item"
            to="/me/verification"
          >
            <ShieldCheck aria-hidden="true" />{{ t('verification.title') }}
          </RouterLink>
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
.avatar { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; background: linear-gradient(145deg, #5e9cff, #0071e3); color: #fff; font: inherit; font-size: .875rem; font-weight: 600; cursor: pointer; transition: transform .3s var(--spring); }
.avatar:active { transform: scale(.92); }
.account-error svg { color: var(--warning); }
@media (max-width: 480px) { .account-error-text { display: none; } }
</style>
