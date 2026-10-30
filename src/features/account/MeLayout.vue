<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import RequireSignIn from './RequireSignIn.vue'

// Shared frame of the personal center: one heading, section links and the
// sign-in boundary for private pages.
withDefaults(defineProps<{ title: string; description?: string; requireSignIn?: boolean }>(), { description: '', requireSignIn: true })
const { t } = useI18n()
const route = useRoute()
const current = (to: string) => route.path === to || (to !== '/me' && route.path.startsWith(`${to}/`))
const links = [
  { to: '/me', label: 'me.overview' },
  { to: '/me/reviews', label: 'me.reviews' },
  { to: '/me/resources', label: 'me.resources' },
  { to: '/me/requests', label: 'me.requests' },
  { to: '/me/verification', label: 'verification.title' },
  { to: '/me/storage-accounts', label: 'custody.title' },
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
        :class="{ active: current(link.to) }"
        :aria-current="current(link.to) ? 'page' : undefined"
      >
        {{ t(link.label) }}
      </RouterLink>
    </nav>
    <div class="stack-lg me-content">
      <PageHeader
        :title="title"
        :description="description"
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
.me { display: grid; grid-template-columns: 13rem minmax(0, 1fr); gap: 2rem; align-items: start; }
.me-nav { position: sticky; top: 76px; display: grid; gap: .15rem; }
.me-nav-title { padding: .25rem .7rem .5rem; font-size: .8rem; font-weight: 650; color: var(--muted); }
.me-nav a { padding: .5rem .7rem; border-radius: var(--radius-sm); color: var(--text); text-decoration: none; }
.me-nav a:hover { background: var(--surface-muted); }
.me-nav a.active { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
@media (max-width: 860px) {
  .me { grid-template-columns: minmax(0, 1fr); gap: 1rem; }
  .me-nav { position: static; display: flex; overflow-x: auto; gap: .25rem; border-bottom: 1px solid var(--border); padding-bottom: .25rem; }
  .me-nav-title { display: none; }
  .me-nav a { flex: 0 0 auto; }
}
</style>
