import { beginMorph, endMorph, pendingTitle, trackTitleClicks } from '../shared/ui/pendingTitle'
import { nextTick } from 'vue'
import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from 'vue-router'
import HomeView from '../features/home/HomeView.vue'
import NotFoundView from '../features/home/NotFoundView.vue'
import { extras } from '../shared/extras'

declare module 'vue-router' {
  interface RouteMeta {
    /** Message key of the document title. */
    title?: string
    /** Top-level navigation section highlighted for this page. */
    section?: 'home' | 'courses' | 'teachers' | 'resources' | 'me'
    /** Content pages need current content access; a person's own records need only a session. */
    access?: 'verified' | 'member'
    /** The path names different content, so the page never reuses another path's state. */
    remountOnPath?: boolean
    /** Path whose page continues as this one instead of remounting. */
    continuesFrom?: string
  }
}

const academic = {
  directory: () => import('../features/academic/DirectoryView.vue'),
  subject: () => import('../features/academic/SubjectView.vue'),
  offering: () => import('../features/academic/OfferingView.vue'),
  discussion: () => import('../features/academic/DiscussionView.vue'),
}

const routes: RouteRecordRaw[] = [
  { path: '/', component: HomeView, meta: { title: 'nav.home', section: 'home' } },
  { path: '/courses', component: academic.directory, props: { kind: 'course' }, meta: { access: 'verified', title: 'nav.courses', section: 'courses' } },
  { path: '/teachers', component: academic.directory, props: { kind: 'teacher' }, meta: { access: 'verified', title: 'nav.teachers', section: 'teachers' } },
  { path: '/courses/:id', component: academic.subject, props: (route) => ({ kind: 'course', id: String(route.params.id) }), meta: { access: 'verified', title: 'academic.course', section: 'courses' } },
  { path: '/teachers/:id', component: academic.subject, props: (route) => ({ kind: 'teacher', id: String(route.params.id) }), meta: { access: 'verified', title: 'academic.teacher', section: 'teachers' } },
  { path: '/offerings/:id', component: academic.offering, props: (route) => ({ kind: 'term_course', id: String(route.params.id) }), meta: { access: 'verified', title: 'academic.offering', section: 'courses' } },
  { path: '/classes/:id', component: academic.offering, props: (route) => ({ kind: 'class', id: String(route.params.id) }), meta: { access: 'verified', title: 'academic.teachingClass', section: 'courses' } },
  { path: '/reviews/:id', component: academic.discussion, props: true, meta: { access: 'verified', title: 'academic.discussion', section: 'courses' } },
  { path: '/resources', component: () => import('../features/resources/BrowseView.vue'), meta: { access: 'verified', title: 'nav.resources', section: 'resources' } },
  { path: '/resources/new', component: () => import('../features/resources/EditorView.vue'), meta: { remountOnPath: true, access: 'verified', title: 'resources.upload', section: 'resources' } },
  { path: '/resources/items/:id', component: () => import('../features/resources/DetailView.vue'), props: true, meta: { access: 'verified', title: 'resources.detailTitle', section: 'resources' } },
  { path: '/resources/items/:id/edit', component: () => import('../features/resources/EditorView.vue'), props: true, meta: { remountOnPath: true, continuesFrom: '/resources/new', access: 'verified', title: 'resources.edit', section: 'resources' } },
  { path: '/me', component: () => import('../features/account/OverviewView.vue'), meta: { title: 'me.title', section: 'me' } },
  { path: '/me/reviews', component: () => import('../features/academic/MyReviewsView.vue'), meta: { access: 'member', title: 'me.reviews', section: 'me' } },
  { path: '/me/reviews/entries/:id', component: () => import('../features/academic/OwnEntryView.vue'), props: true, meta: { access: 'member', title: 'me.reviews', section: 'me' } },
  { path: '/me/favorites', component: () => import('../features/favorites/FavoritesView.vue'), meta: { access: 'member', title: 'favorites.title', section: 'me' } },
  { path: '/me/qq/callback', component: () => import('../features/qq/QqCallbackView.vue'), meta: { access: 'member', title: 'qq.callback.title', section: 'me' } },
  { path: '/me/resources', component: () => import('../features/resources/MyResourcesView.vue'), meta: { access: 'member', title: 'me.resources', section: 'me' } },
  { path: '/me/courses', component: () => import('../features/academic/MyCoursesView.vue'), meta: { access: 'member', title: 'courses.title', section: 'me' } },
  { path: '/me/requests', component: () => import('../features/resources/RequestsView.vue'), meta: { access: 'member', title: 'me.requests', section: 'me' } },
  { path: '/me/account', component: () => import('../features/account/SecurityView.vue'), meta: { access: 'member', title: 'security.title', section: 'me' } },
  { path: '/me/account/identity', component: () => import('../features/verification/VerificationView.vue'), props: { scope: 'identity' }, meta: { remountOnPath: true, title: 'verification.identityTitle', section: 'me' } },
  { path: '/me/verification', component: () => import('../features/verification/VerificationView.vue'), meta: { remountOnPath: true, title: 'verification.title', section: 'me' } },
  { path: '/me/storage', component: () => import('../features/storage/ContributionsView.vue'), meta: { title: 'nav.contributions', section: 'me' } },
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
  let finish: (() => void) | undefined
  router.afterEach(() => { finish?.(); finish = undefined })
  router.beforeResolve((to, from) => {
    if (to.path === from.path || !from.matched.length || !document.startViewTransition) return
    return new Promise<void>((proceed) => {
      beginMorph(to.path)
      const transition = document.startViewTransition(async () => {
        const navigated = new Promise<void>((resolve) => { finish = resolve })
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
    scrollBehavior: (to, _from, saved) => (saved ? restore(saved.top) : to.hash ? { el: to.hash } : { top: 0 }),
  })
  installPageTransition(router)
  return router
}
