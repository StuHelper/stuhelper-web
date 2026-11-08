<script setup lang="ts">
import { BookOpen, FolderOpen, GraduationCap, House, UserRound } from 'lucide-vue-next'
import { computed, nextTick, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { extras } from '../../shared/extras'
import ToastHost from '../../shared/ui/ToastHost.vue'
import AccountMenu from './AccountMenu.vue'
import LocaleSelect from './LocaleSelect.vue'

const { t, locale } = useI18n()
const route = useRoute()
const section = computed(() => route.meta.section)
const links = [
  { to: '/', label: 'nav.home', section: 'home' },
  { to: '/courses', label: 'nav.courses', section: 'courses' },
  { to: '/teachers', label: 'nav.teachers', section: 'teachers' },
  { to: '/resources', label: 'nav.resources', section: 'resources' },
] as const
// Phones get a tab bar. Contributions move into the personal center there, since
// five tabs are the most that stay readable in all eight languages.
const tabs: { to: string; label: string; section: string; icon: Component }[] = [
  { to: '/', label: 'nav.home', section: 'home', icon: House },
  { to: '/courses', label: 'nav.courses', section: 'courses', icon: BookOpen },
  { to: '/teachers', label: 'nav.teachers', section: 'teachers', icon: GraduationCap },
  { to: '/resources', label: 'nav.resources', section: 'resources', icon: FolderOpen },
  { to: '/me', label: 'nav.me', section: 'me', icon: UserRound },
]

watch([() => route.meta.title, locale], () => {
  const title = route.meta.title ? t(route.meta.title) : ''
  document.title = title && route.meta.section !== 'home' ? `${title} · ${t('brand.name')}` : t('brand.title')
}, { immediate: true })

// Move focus to the new page so keyboard and screen-reader users start there.
watch(() => route.path, async (_path, previous) => {
  if (previous === undefined) return
  await nextTick()
  document.getElementById('main-content')?.focus({ preventScroll: true })
})
</script>

<template>
  <a
    class="skip-link"
    href="#main-content"
  >{{ t('shell.skip') }}</a>
  <div class="shell">
    <header class="nav">
      <div class="container nav-bar">
        <RouterLink
          class="brand"
          to="/"
          :aria-label="t('brand.home')"
        >
          <img
            src="/brand.png"
            alt=""
            width="26"
            height="26"
          >
          <span class="brand-name">{{ t('brand.name') }}</span>
        </RouterLink>
        <nav
          class="nav-links"
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
        <div class="nav-tools">
          <component
            :is="tool"
            v-for="(tool, index) in extras.navTools"
            :key="index"
          />
          <LocaleSelect />
          <AccountMenu />
        </div>
      </div>
    </header>
    <main
      id="main-content"
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
    <nav
      class="tabbar"
      :aria-label="t('nav.primary')"
    >
      <RouterLink
        v-for="tab in tabs"
        :key="tab.to"
        class="tabbar-item"
        :to="tab.to"
        :aria-current="section === tab.section ? 'page' : undefined"
      >
        <component
          :is="tab.icon"
          :stroke-width="section === tab.section ? 2.3 : 1.8"
          aria-hidden="true"
        />
        <span>{{ t(tab.label) }}</span>
      </RouterLink>
    </nav>
    <ToastHost />
    <component
      :is="item"
      v-for="(item, index) in extras.floating"
      :key="index"
    />
  </div>
</template>

<style scoped>
.skip-link { position: fixed; inset-block-start: .5rem; inset-inline-start: .5rem; z-index: 100; padding: .5rem 1rem; border-radius: var(--pill); background: var(--accent-fill); color: #fff; transform: translateY(-200%); }
.skip-link:focus { transform: none; }
.shell { display: flex; flex-direction: column; min-height: 100dvh; }
.nav { view-transition-name: shell-nav; position: sticky; inset-block-start: 0; z-index: 40; background: var(--glass); box-shadow: 0 .5px 0 var(--separator); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); }
.nav-bar { display: flex; align-items: center; gap: 1.5rem; height: var(--nav-height); }
.brand { display: inline-flex; flex: none; align-items: center; gap: .5rem; color: var(--label); font-size: 1.0625rem; font-weight: 620; }
.brand:hover { text-decoration: none; color: var(--label); }
.brand img { border-radius: 6px; object-fit: contain; }
.nav-links { display: flex; flex: none; align-items: center; gap: .125rem; }
.nav-links a { padding: .3125rem .75rem; border-radius: var(--pill); color: var(--label-2); font-size: .875rem; white-space: nowrap; transition: color .2s, background-color .2s; }
.nav-links a:hover { color: var(--label); text-decoration: none; }
.nav-links a[aria-current="page"] { color: var(--label); font-weight: 550; background: var(--fill); }
.nav-tools { container: nav-tools / inline-size; display: flex; flex: 1; justify-content: flex-end; align-items: center; gap: .375rem; min-width: 0; }
/* 空间不足时只收窄搜索框，头像和其他按钮保持原尺寸。 */
.nav-tools > :deep(*) { flex-shrink: 0; }
.shell-main { flex: 1; min-height: calc(100dvh - var(--nav-height)); view-transition-name: page; padding-block: clamp(1.75rem, 4vw, 3.25rem) clamp(3rem, 6vw, 5rem); }
.shell-footer { padding-block: 1.25rem; box-shadow: inset 0 .5px 0 var(--separator); color: var(--label-3); font-size: .75rem; }
.tabbar { display: none; view-transition-name: shell-tabbar; }

/* 最窄的手机上只保留品牌图标，给工具按钮留出位置。 */
@media (max-width: 360px) {
  .brand-name { display: none; }
}

@media (max-width: 760px) {
  .nav-links { display: none; }
  .shell-main { padding-block: 1.25rem 2.5rem; }
  .shell-footer { padding-block-end: calc(var(--tab-height) + var(--safe-bottom) + 1.25rem); }
  .tabbar {
    position: fixed;
    inset: auto 0 0;
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    padding-block-end: var(--safe-bottom);
    background: var(--glass);
    box-shadow: 0 -.5px 0 var(--separator);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
  }
  .tabbar-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: var(--tab-height); min-width: 0; padding-inline: 2px; color: var(--label-3); font-size: .6875rem; font-weight: 500; line-height: 1.1; transition: transform .3s var(--spring); }
  .tabbar-item:hover { text-decoration: none; }
  .tabbar-item:active { transform: scale(.9); }
  .tabbar-item svg { width: 25px; height: 25px; }
  .tabbar-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tabbar-item[aria-current="page"] { color: var(--accent); }
}
</style>
