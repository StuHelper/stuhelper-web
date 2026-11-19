import { myCoursesEnabled, teacherDirectoryEnabled } from './features'
import { beginMorph, endMorph, pendingTitle, trackTitleClicks } from '../shared/ui/pendingTitle'
import { nextTick } from 'vue'
import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from 'vue-router'
import HomeView from '../features/home/HomeView.vue'
import NotFoundView from '../features/home/NotFoundView.vue'
import { feature } from '../shared/capabilities'
import { extras } from '../shared/extras'

declare module 'vue-router' {
  interface RouteMeta {
    /** Message key of the document title. */
    title?: string
    /** Top-level navigation section highlighted for this page. */
    section?: 'portal' | 'api' | 'store' | 'home' | 'courses' | 'teachers' | 'resources' | 'me'
    /** Content pages need current content access; a person's own records need only a session. */
    access?: 'verified' | 'member'
    /** The path names different content, so the page never reuses another path's state. */
    remountOnPath?: boolean
    /** Path whose page continues as this one instead of remounting. */
    continuesFrom?: string
    /** Capability of an optional module; without it the page shows as unavailable. */
    capability?: string
  }
}

const academic = {
  directory: () => import('../features/academic/DirectoryView.vue'),
  subject: () => import('../features/academic/SubjectView.vue'),
  discussion: () => import('../features/academic/DiscussionView.vue'),
}

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('../features/portal/PortalView.vue'), meta: { section: 'portal' } },
  { path: '/campus', component: HomeView, meta: { title: 'nav.campus', section: 'home' } },
  { path: '/newapi', component: () => import('../features/portal/ProductView.vue'), props: { product: 'api' }, meta: { remountOnPath: true, section: 'api' } },
  { path: '/store', component: () => import('../features/portal/ProductView.vue'), props: { product: 'store' }, meta: { remountOnPath: true, section: 'store' } },
  { path: '/courses', component: academic.directory, props: { kind: 'course' }, meta: { remountOnPath: true, access: 'verified', title: 'nav.courses', section: 'courses' } },
  teacherDirectoryEnabled
    ? { path: '/teachers', component: academic.directory, props: { kind: 'teacher' }, meta: { remountOnPath: true, access: 'verified', title: 'nav.teachers', section: 'teachers' } }
    : { path: '/teachers', redirect: '/courses' },
  { path: '/courses/:id', component: academic.subject, props: (route) => ({ kind: 'course', id: String(route.params.id) }), meta: { access: 'verified', title: 'academic.course', section: 'courses' } },
  { path: '/teachers/:id', component: academic.subject, props: (route) => ({ kind: 'teacher', id: String(route.params.id) }), meta: { access: 'verified', title: 'academic.teacher', section: 'teachers' } },
  // Offering and teaching-class pages are closed; old links land on the course directory.
  { path: '/offerings/:id', redirect: '/courses' },
  { path: '/classes/:id', redirect: '/courses' },
  { path: '/reviews/:id', component: academic.discussion, props: true, meta: { access: 'verified', title: 'academic.discussion', section: 'courses' } },
  { path: '/resources', component: () => import('../features/resources/BrowseView.vue'), meta: { access: 'verified', title: 'nav.resources', section: 'resources' } },
  { path: '/resources/new', component: () => import('../features/resources/EditorView.vue'), meta: { remountOnPath: true, access: 'verified', title: 'resources.upload', section: 'resources' } },
  { path: '/resources/items/:id', component: () => import('../features/resources/DetailView.vue'), props: true, meta: { remountOnPath: true, access: 'member', title: 'resources.detailTitle', section: 'resources' } },
  { path: '/resources/items/:id/edit', component: () => import('../features/resources/EditorView.vue'), props: true, meta: { remountOnPath: true, continuesFrom: '/resources/new', access: 'member', title: 'resources.edit', section: 'resources' } },
  { path: '/me', component: () => import('../features/account/OverviewView.vue'), meta: { title: 'me.title', section: 'me' } },
  { path: '/me/reviews', component: () => import('../features/academic/MyReviewsView.vue'), meta: { access: 'member', title: 'me.reviews', section: 'me' } },
  { path: '/me/reviews/entries/:id', component: () => import('../features/academic/OwnEntryView.vue'), props: true, meta: { access: 'member', title: 'me.reviews', section: 'me' } },
  { path: '/me/membership', component: () => import('../features/wallet/MembershipView.vue'), meta: { capability: feature.membership, access: 'member', title: 'membership.title', section: 'me' } },
  { path: '/me/wallet', component: () => import('../features/wallet/WalletView.vue'), meta: { capability: feature.wallet, access: 'member', title: 'wallet.title', section: 'me' } },
  { path: '/me/apps', component: () => import('../features/open-platform/GrantsView.vue'), meta: { capability: feature.openPlatform, access: 'member', title: 'platform.grants.title', section: 'me' } },
  { path: '/me/developer', component: () => import('../features/open-platform/DeveloperView.vue'), meta: { capability: feature.openPlatform, access: 'member', title: 'platform.developer.title', section: 'me' } },
  { path: '/oauth/authorize', component: () => import('../features/open-platform/ConsentView.vue'), meta: { capability: feature.openPlatform, access: 'member', title: 'platform.consent.title' } },
  { path: '/search', component: () => import('../features/search/SearchView.vue'), meta: { capability: feature.search, access: 'verified', title: 'search.title' } },
  { path: '/popular', component: () => import('../features/search/PopularView.vue'), meta: { capability: feature.search, access: 'verified', title: 'search.popular.title', section: 'courses' } },
  { path: '/compare', component: () => import('../features/search/CompareView.vue'), meta: { access: 'verified', title: 'search.compare.title', section: 'courses' } },
  { path: '/me/votes', component: () => import('../features/search/MyVotesView.vue'), meta: { capability: feature.search, access: 'member', title: 'search.votes.title', section: 'me' } },
  { path: '/notifications', component: () => import('../features/notifications/NotificationsView.vue'), meta: { capability: feature.notifications, access: 'member', title: 'notifications.title', section: 'me' } },
  { path: '/me/favorites', component: () => import('../features/favorites/FavoritesView.vue'), meta: { capability: feature.favorites, access: 'member', title: 'favorites.title', section: 'me' } },
  { path: '/me/groups', component: () => import('../features/groups/MyGroupsView.vue'), meta: { capability: feature.groups, access: 'member', title: 'groups.title', section: 'me' } },
  { path: '/me/qq/callback', component: () => import('../features/qq/QqCallbackView.vue'), meta: { capability: feature.qq, access: 'member', title: 'qq.callback.title', section: 'me' } },
  { path: '/me/resources', component: () => import('../features/resources/MyResourcesView.vue'), meta: { access: 'member', title: 'me.resources', section: 'me' } },
  myCoursesEnabled
    ? { path: '/me/courses', component: () => import('../features/academic/MyCoursesView.vue'), meta: { access: 'member', title: 'courses.title', section: 'me' } }
    : { path: '/me/courses', redirect: '/me' },
  { path: '/me/requests', component: () => import('../features/resources/RequestsView.vue'), meta: { access: 'member', title: 'me.requests', section: 'me' } },
  { path: '/me/profile', component: () => import('../features/account/ProfileView.vue'), meta: { access: 'member', title: 'profile.title', section: 'me' } },
  { path: '/me/account', component: () => import('../features/account/SecurityView.vue'), meta: { access: 'member', title: 'security.title', section: 'me' } },
  { path: '/me/account/identity', component: () => import('../features/verification/VerificationView.vue'), props: { scope: 'identity' }, meta: { remountOnPath: true, title: 'verification.identityTitle', section: 'me' } },
  { path: '/me/verification', component: () => import('../features/verification/VerificationView.vue'), meta: { remountOnPath: true, title: 'verification.unified.title', section: 'me' } },
  { path: '/me/storage', component: () => import('../features/storage/ContributionsView.vue'), meta: { title: 'nav.contributions', section: 'me' } },
  { path: '/me/verification/teacher', component: () => import('../features/verification/TeacherView.vue'), meta: { title: 'verification.unified.title', section: 'me' } },
  { path: '/verification/capture', component: () => import('../features/verification/CaptureView.vue'), meta: { title: 'verification.capture.title', section: 'me' } },
  { path: '/:pathMatch(.*)*', component: NotFoundView, meta: { title: 'notFound.title' } },
]

/** A list reloads after going back, so wait briefly until the page is tall enough. */
function restore(top: number) {
  return new Promise<{ top: number }>((resolve) => {
    const started = Date.now()
    const check = () => {
      if (document.documentElement.scrollHeight >= top + window.innerHeight || Date.now() - started > 1500) resolve({ top })
      else requestAnimationFrame(check)
    }
    check()
  })
}

/**
 * Cross-fade between pages with the View Transitions API. The browser keeps a
 * snapshot of the old page until the new one is in the DOM, so no blank frame
 * appears. Query-only changes such as tabs and filters stay in place, and
 * browsers without the API switch directly.
 */
function installPageTransition(router: Router) {
  trackTitleClicks()
  const completions = new WeakMap<object, () => void>()
  router.afterEach(to => { completions.get(to)?.(); completions.delete(to) })
  router.onError((_, to) => { completions.get(to)?.(); completions.delete(to) })
  router.beforeResolve((to, from) => {
    if (to.path === from.path || !from.matched.length || !document.startViewTransition) return
    return new Promise<void>((proceed) => {
      const navigated = new Promise<void>(resolve => completions.set(to, resolve))
      beginMorph(to.path)
      const transition = document.startViewTransition(async () => {
        proceed()
        await navigated
        endMorph()
        await nextTick()
      })
      // A skipped transition still updates the page, so its rejection is not a failure.
      transition.ready.catch(() => undefined)
      transition.finished.finally(() => { pendingTitle.value = '' }).catch(() => undefined)
    })
  })
}

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes: [...extras.routes, ...routes],
    // Fragments name an element (#platform) or carry list filters (#department=06);
    // only the former scrolls. Changing filters on the same page keeps the position.
    scrollBehavior: (to, from, saved) => (saved ? restore(saved.top) : /^#[\w-]+$/.test(to.hash) ? { el: to.hash, behavior: 'smooth' } : to.path === from.path ? false : { top: 0 }),
  })
  installPageTransition(router)
  return router
}
