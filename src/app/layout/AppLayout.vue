<script setup lang="ts">
import { BookOpen, Compass, FolderOpen, GraduationCap, Scale, UserRound } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { extras } from '../../shared/extras'
import ToastHost from '../../shared/ui/ToastHost.vue'
import CompareTray from '../../features/search/CompareTray.vue'
import SearchPalette from '../../features/search/SearchPalette.vue'
import { feature, useCapabilities } from '../../shared/capabilities'
import { products } from '../products'
import AccountMenu from './AccountMenu.vue'
import LocaleSelect from './LocaleSelect.vue'
import ThemeToggle from './ThemeToggle.vue'

// StuHelper is one brand with several products. The bar switches between
// products; the campus product adds its own sub-navigation below the bar.
const { t, locale } = useI18n()
const route = useRoute()
const section = computed(() => route.meta.section)
const capabilities = useCapabilities()
const campusSections = ['home', 'courses', 'teachers', 'resources']
const product = computed(() => {
  if (section.value === 'portal') return 'portal'
  if (section.value === 'api' || section.value === 'store') return section.value
  if (campusSections.includes(section.value ?? '') || route.path === '/search') return 'campus'
  return 'account'
})
const promotional = computed(() => ['portal', 'api', 'store'].includes(product.value))
const productLinks = [
  { to: '/campus', label: 'nav.campus', product: 'campus' },
  { to: products.api.path, name: products.api.name, product: 'api' },
  { to: '/store', name: products.store.name, product: 'store' },
] as const
// Comparing sits beside courses in the sub-navigation, so the courses entry
// yields to it on the comparison page.
const subnav: { to: string; label: string; icon: Component; active: () => boolean }[] = [
  { to: '/campus', label: 'nav.discover', icon: Compass, active: () => section.value === 'home' },
  { to: '/courses', label: 'nav.courses', icon: BookOpen, active: () => section.value === 'courses' && route.path !== '/compare' },
  { to: '/teachers', label: 'nav.teachers', icon: GraduationCap, active: () => section.value === 'teachers' },
  { to: '/resources', label: 'nav.resources', icon: FolderOpen, active: () => section.value === 'resources' },
  { to: '/compare', label: 'search.compare.title', icon: Scale, active: () => route.path === '/compare' },
]
// Phones get a tab bar. Contributions move into the personal center there, since
// five tabs are the most that stay readable in all eight languages.
const tabs: { to: string; label: string; section: string; icon: Component }[] = [
  { to: '/campus', label: 'nav.discover', section: 'home', icon: Compass },
  { to: '/courses', label: 'nav.courses', section: 'courses', icon: BookOpen },
  { to: '/teachers', label: 'nav.teachers', section: 'teachers', icon: GraduationCap },
  { to: '/resources', label: 'nav.resources', section: 'resources', icon: FolderOpen },
  { to: '/me', label: 'nav.me', section: 'me', icon: UserRound },
]

watch([() => route.meta.title, section, locale], () => {
  const title = route.meta.title ? t(route.meta.title) : ''
  if (section.value === 'api' || section.value === 'store') document.title = products[section.value].fullName
  else document.title = title ? `${title} · ${t('brand.name')}` : t('brand.title')
}, { immediate: true })

// Sticky page elements read --nav-height, which grows while the sub-navigation shows.
watchEffect(() => document.documentElement.classList.toggle('has-subnav', product.value === 'campus'))
onBeforeUnmount(() => document.documentElement.classList.remove('has-subnav'))

// One highlight per navigation row slides to the current link, so a change of
// page reads as movement. Positions are measured because labels differ by language.
const linksRow = ref<HTMLElement>()
const subnavRow = ref<HTMLElement>()
const pill = reactive({ x: 0, width: 0, shown: false, ready: false })
const line = reactive({ x: 0, width: 0, shown: false, ready: false })
function place(row: HTMLElement | undefined, mark: typeof pill) {
  const current = row?.querySelector<HTMLElement>('[aria-current="page"]')
  if (!current) {
    mark.shown = false
    mark.ready = false
    return
  }
  mark.x = current.offsetLeft
  mark.width = current.offsetWidth
  // The first position appears in place; only later changes slide.
  if (mark.shown) mark.ready = true
  mark.shown = true
}
async function measure() {
  await nextTick()
  place(linksRow.value, pill)
  place(subnavRow.value, line)
}
watch([() => route.path, locale, product], measure, { flush: 'post' })
const scrolled = ref(false)
const onScroll = () => { scrolled.value = window.scrollY > 4 }
let resizes: ResizeObserver | undefined
onMounted(() => {
  void measure()
  void document.fonts?.ready.then(measure)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  if (typeof ResizeObserver !== 'undefined' && linksRow.value) {
    resizes = new ResizeObserver(() => void measure())
    resizes.observe(linksRow.value)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  resizes?.disconnect()
})

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
  <div
    class="shell"
    :class="{ 'has-tabbar': !promotional }"
    :data-product="product"
  >
    <header
      class="nav"
      :class="{ scrolled }"
    >
      <div class="container">
        <div class="nav-bar">
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
            ref="linksRow"
            class="nav-links"
            :aria-label="t('nav.primary')"
          >
            <span
              class="nav-pill"
              :class="{ shown: pill.shown, ready: pill.ready }"
              :style="{ left: `${pill.x}px`, width: `${pill.width}px` }"
              aria-hidden="true"
            />
            <RouterLink
              v-for="link in productLinks"
              :key="link.to"
              :to="link.to"
              :aria-current="product === link.product ? 'page' : undefined"
            >
              {{ 'label' in link ? t(link.label) : link.name }}
            </RouterLink>
          </nav>
          <div class="nav-tools">
            <SearchPalette v-if="!promotional && capabilities.has(feature.search)" />
            <component
              :is="tool"
              v-for="(tool, index) in extras.navTools"
              :key="index"
            />
            <ThemeToggle class="bar-setting" />
            <LocaleSelect class="bar-setting" />
            <AccountMenu />
          </div>
        </div>
      </div>
      <nav
        v-if="product === 'campus'"
        class="subnav"
        :aria-label="t('nav.campusSections')"
      >
        <div class="container">
          <div
            ref="subnavRow"
            class="subnav-row"
          >
            <span
              class="subnav-line"
              :class="{ shown: line.shown, ready: line.ready }"
              :style="{ left: `${line.x}px`, width: `${line.width}px` }"
              aria-hidden="true"
            />
            <RouterLink
              v-for="link in subnav"
              :key="link.to"
              :to="link.to"
              :aria-current="link.active() ? 'page' : undefined"
            >
              <component
                :is="link.icon"
                aria-hidden="true"
              />{{ t(link.label) }}
            </RouterLink>
          </div>
        </div>
      </nav>
    </header>
    <main
      id="main-content"
      class="container shell-main"
      tabindex="-1"
    >
      <slot />
    </main>
    <footer class="shell-footer">
      <div class="container footer-row">
        <span class="footer-brand">{{ t('brand.name') }}</span>
        <nav
          class="footer-links"
          :aria-label="t('nav.products')"
        >
          <RouterLink to="/campus">
            {{ t('nav.campus') }}
          </RouterLink>
          <RouterLink :to="products.api.path">
            {{ products.api.name }}
          </RouterLink>
          <RouterLink to="/store">
            {{ products.store.name }}
          </RouterLink>
          <RouterLink :to="{ path: '/', hash: '#platform' }">
            {{ t('nav.platform') }}
          </RouterLink>
        </nav>
        <span class="footer-note">{{ t('shell.footer') }}</span>
        <!-- On narrow phones appearance and language move here, so the bar keeps room for the products. -->
        <div class="footer-settings">
          <ThemeToggle />
          <LocaleSelect />
        </div>
      </div>
    </footer>
    <nav
      v-if="!promotional"
      class="tabbar"
      :aria-label="t('nav.campusSections')"
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
    <CompareTray />
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
/*
 * Navigation floats above the page as glass capsules, as in iOS 26. The header
 * itself is transparent and lets clicks through; a soft fade under it keeps
 * scrolled content from colliding with the capsules.
 */
.nav { view-transition-name: shell-nav; position: sticky; inset-block-start: 0; z-index: 40; padding-block-start: .625rem; pointer-events: none; }
.nav::before { content: ""; position: absolute; inset: 0 0 -1.25rem; z-index: -1; background: linear-gradient(var(--bg) 30%, transparent); opacity: .92; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); mask-image: linear-gradient(#000 55%, transparent); -webkit-mask-image: linear-gradient(#000 55%, transparent); }
.nav-bar, .subnav-row { pointer-events: auto; background: var(--glass); box-shadow: var(--glass-edge), var(--glass-shadow); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter); transition: box-shadow .3s; }
.nav-bar { display: flex; align-items: center; gap: 1.25rem; height: 52px; padding-inline: 1rem .5rem; border-radius: var(--pill); }
.nav.scrolled .nav-bar, .nav.scrolled .subnav-row { box-shadow: var(--glass-edge), 0 2px 4px rgb(0 0 0 / 5%), 0 18px 40px -12px rgb(0 0 0 / 24%); }
.brand { display: inline-flex; flex: none; align-items: center; gap: .5rem; color: var(--label); font-size: 1.0625rem; font-weight: 700; letter-spacing: -.01em; }
.brand:hover { text-decoration: none; color: var(--label); }
.brand img { border-radius: 6px; object-fit: contain; transition: transform .5s var(--spring); }
.brand:hover img { transform: rotate(-10deg) scale(1.1); }
.brand:active img { transform: scale(.92); }
.nav-links { position: relative; display: flex; flex: none; align-items: center; gap: .125rem; }
.nav-pill, .subnav-line { position: absolute; inset-block: 50% auto; border-radius: var(--pill); background: var(--fill); box-shadow: var(--control-edge); opacity: 0; translate: 0 -50%; pointer-events: none; }
.nav-pill { height: 2.125rem; }
.subnav-line { height: 2rem; background: var(--accent-soft); box-shadow: none; }
.nav-pill.shown, .subnav-line.shown { opacity: 1; }
.nav-pill.ready, .subnav-line.ready { transition: left .5s var(--ease), width .5s var(--ease), opacity .2s; }
.nav-links a { position: relative; padding: .3125rem .875rem; border-radius: var(--pill); color: var(--label-2); font-size: .9375rem; white-space: nowrap; transition: color .2s, transform .3s var(--spring); }
.nav-links a:hover { color: var(--label); text-decoration: none; }
.nav-links a[aria-current="page"] { color: var(--label); font-weight: 600; }
.nav-links a:active { transform: scale(.94); }
.nav-tools { container: nav-tools / inline-size; display: flex; flex: 1; justify-content: flex-end; align-items: center; gap: .375rem; min-width: 0; }
/* 空间不足时只收窄搜索框，头像和其他按钮保持原尺寸。 */
.nav-tools > :deep(*) { flex-shrink: 0; }
.subnav { margin-block-start: .5rem; animation: subnav-in .45s var(--ease-out) both; }
@keyframes subnav-in { from { opacity: 0; transform: translateY(-8px) scale(.97); } }
.subnav-row { position: relative; display: flex; align-items: center; gap: .125rem; width: fit-content; max-width: 100%; height: 40px; padding-inline: .25rem; overflow-x: auto; border-radius: var(--pill); scrollbar-width: none; }
.subnav-row a { position: relative; display: inline-flex; flex: none; align-items: center; gap: .375rem; height: 2rem; padding-inline: .75rem; border-radius: var(--pill); color: var(--label-2); font-size: .875rem; white-space: nowrap; transition: color .2s, transform .3s var(--spring); }
.subnav-row a:hover { color: var(--label); text-decoration: none; }
.subnav-row a:active { transform: scale(.94); }
.subnav-row a svg { width: 16px; height: 16px; transition: transform .4s var(--spring); }
.subnav-row a:hover svg { transform: translateY(-1px) scale(1.08); }
.subnav-row a[aria-current="page"] { color: var(--accent); font-weight: 600; }
.shell-main { flex: 1; min-height: calc(100dvh - var(--nav-height)); view-transition-name: page; padding-block: clamp(1.25rem, 2.2vw, 2rem) clamp(2.5rem, 5vw, 4rem); }
.shell-footer { padding-block: 1.25rem; box-shadow: inset 0 .5px 0 var(--separator); color: var(--label-3); font-size: .8125rem; }
.footer-row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.5rem; }
.footer-brand { color: var(--label-2); font-weight: 650; }
.footer-links { display: flex; flex-wrap: wrap; gap: .25rem 1.25rem; }
.footer-links a { color: var(--label-3); }
.footer-links a { transition: color .2s; }
.footer-links a:hover { color: var(--label); text-decoration: none; }
.footer-note { margin-inline-start: auto; }
.footer-settings { display: none; }
.tabbar { display: none; view-transition-name: shell-tabbar; }

/* 最窄的手机上只保留品牌图标，给产品入口和工具按钮留出位置。 */
@media (max-width: 480px) {
  .brand-name { display: none; }
  .nav-bar { gap: .375rem; padding-inline: .75rem .375rem; }
  .bar-setting { display: none; }
  .footer-settings { display: flex; gap: .25rem; margin-inline-start: auto; }
  .nav-links a { padding-inline: .625rem; font-size: .875rem; }
}

@media (max-width: 760px) {
  .nav-bar { gap: .625rem; }
  /* 窄屏上工具按钮保持原位，产品入口放不下时在自己的区域内横向滚动。 */
  .nav-links { flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .nav-links a { flex: none; }
  /* 尺寸容器的固有宽度为零，窄屏上取消它，工具区才能按内容占位。 */
  .nav-tools { container-type: normal; flex: none; gap: .125rem; }
  .subnav { display: none; }
  .shell-main { padding-block: 1.25rem 2.5rem; }
  .footer-note { margin-inline-start: 0; }
  .has-tabbar .shell-footer { padding-block-end: calc(var(--tab-height) + var(--safe-bottom) + 1.25rem); }
  /* The tab bar is a floating glass capsule; the current tab sits in a lozenge. */
  .tabbar {
    position: fixed;
    inset: auto .75rem calc(.5rem + var(--safe-bottom));
    z-index: 40;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    height: 60px;
    padding: 4px;
    border-radius: var(--pill);
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--glass-shadow);
    backdrop-filter: var(--glass-filter);
    -webkit-backdrop-filter: var(--glass-filter);
  }
  .tabbar-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; min-width: 0; padding-inline: 2px; border-radius: var(--pill); color: var(--label-2); font-size: .6875rem; font-weight: 550; line-height: 1.1; transition: transform .3s var(--spring), background-color .3s, color .2s; }
  .tabbar-item:hover { text-decoration: none; }
  .tabbar-item:active { transform: scale(.9); }
  .tabbar-item svg { width: 23px; height: 23px; }
  .tabbar-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tabbar-item[aria-current="page"] { background: var(--fill); color: var(--accent); }
}
</style>
