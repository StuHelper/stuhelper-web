<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import AccountMenu from './AccountMenu.vue'
import LocaleSelect from './LocaleSelect.vue'

const { t, locale } = useI18n()
const route = useRoute()
const menuOpen = ref(false)
const main = ref<HTMLElement>()
const links = [
  { to: '/', label: 'nav.home', section: 'home' },
  { to: '/courses', label: 'nav.courses', section: 'courses' },
  { to: '/teachers', label: 'nav.teachers', section: 'teachers' },
  { to: '/resources', label: 'nav.resources', section: 'resources' },
  { to: '/contributions', label: 'nav.contributions', section: 'contributions' },
] as const
const section = computed(() => route.meta.section)

watch([() => route.meta.title, locale], () => {
  const title = route.meta.title ? t(route.meta.title) : ''
  document.title = title && route.meta.section !== 'home' ? `${title} · ${t('brand.name')}` : t('brand.title')
}, { immediate: true })

// Move focus to the new page so keyboard and screen-reader users start there.
watch(() => route.path, async (_path, previous) => {
  menuOpen.value = false
  if (previous === undefined) return
  await nextTick()
  main.value?.focus({ preventScroll: true })
})
</script>

<template>
  <a
    class="skip-link"
    href="#main-content"
  >{{ t('shell.skip') }}</a>
  <div class="shell">
    <header class="shell-header">
      <div class="container shell-bar">
        <RouterLink
          class="brand"
          to="/"
          :aria-label="t('brand.home')"
        >
          <img
            src="/brand.png"
            alt=""
            width="34"
            height="34"
          >
          <span class="brand-name">{{ t('brand.name') }}</span>
        </RouterLink>
        <button
          class="btn btn-sm btn-ghost menu-toggle"
          type="button"
          :aria-expanded="menuOpen"
          aria-controls="primary-nav"
          @click="menuOpen = !menuOpen"
        >
          {{ t('nav.menu') }}
        </button>
        <nav
          id="primary-nav"
          class="primary-nav"
          :class="{ open: menuOpen }"
          :aria-label="t('nav.primary')"
        >
          <RouterLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            :aria-current="section === link.section ? 'page' : undefined"
          >
            {{ t(link.label) }}
          </RouterLink>
        </nav>
        <div class="shell-tools">
          <LocaleSelect />
          <AccountMenu />
        </div>
      </div>
    </header>
    <main
      id="main-content"
      ref="main"
      class="container shell-main"
      tabindex="-1"
    >
      <slot />
    </main>
    <footer class="shell-footer">
      <div class="container row-between">
        <span>{{ t('brand.name') }}</span>
        <span>{{ t('shell.footer') }}</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.shell { min-height: 100dvh; display: flex; flex-direction: column; }
.shell-header { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
.shell-bar { display: flex; align-items: center; gap: 1rem; min-height: 60px; }
.brand { display: inline-flex; align-items: center; gap: .55rem; color: var(--text); text-decoration: none; font-weight: 720; font-size: 1.05rem; }
.brand img { object-fit: contain; }
.primary-nav { display: flex; align-items: center; gap: .15rem; flex: 1; }
.primary-nav a { padding: .45rem .7rem; border-radius: var(--radius-sm); color: var(--muted); font-weight: 580; text-decoration: none; white-space: nowrap; }
.primary-nav a:hover { color: var(--text); background: var(--surface-muted); }
.primary-nav a[aria-current="page"] { color: var(--accent-strong); background: var(--accent-soft); }
.shell-tools { display: flex; align-items: center; gap: .5rem; margin-inline-start: auto; }
.menu-toggle { display: none; }
.shell-main { flex: 1; padding-block: 2rem 4rem; outline: none; }
.shell-footer { padding-block: 1.25rem; border-top: 1px solid var(--border); color: var(--subtle); font-size: .8rem; }
@media (max-width: 860px) {
  .shell-bar { flex-wrap: wrap; gap: .5rem; padding-block: .5rem; }
  .menu-toggle { display: inline-flex; order: 3; }
  .shell-tools { order: 2; }
  .primary-nav { order: 4; flex-basis: 100%; display: none; flex-direction: column; align-items: stretch; padding-block: .25rem .5rem; }
  .primary-nav.open { display: flex; }
  .shell-main { padding-block: 1.25rem 3rem; }
}
@media (max-width: 420px) {
  .brand-name { display: none; }
}
</style>
