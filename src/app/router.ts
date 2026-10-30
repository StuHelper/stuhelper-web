import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from '../features/home/HomeView.vue'
import NotFoundView from '../features/home/NotFoundView.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Message key of the document title. */
    title?: string
    /** Top-level navigation section highlighted for this page. */
    section?: 'home' | 'courses' | 'teachers' | 'resources' | 'contributions' | 'me'
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
  { path: '/courses', component: academic.directory, props: { kind: 'course' }, meta: { title: 'nav.courses', section: 'courses' } },
  { path: '/teachers', component: academic.directory, props: { kind: 'teacher' }, meta: { title: 'nav.teachers', section: 'teachers' } },
  { path: '/courses/:id', component: academic.subject, props: (route) => ({ kind: 'course', id: String(route.params.id) }), meta: { title: 'academic.course', section: 'courses' } },
  { path: '/teachers/:id', component: academic.subject, props: (route) => ({ kind: 'teacher', id: String(route.params.id) }), meta: { title: 'academic.teacher', section: 'teachers' } },
  { path: '/offerings/:id', component: academic.offering, props: (route) => ({ kind: 'term_course', id: String(route.params.id) }), meta: { title: 'academic.offering', section: 'courses' } },
  { path: '/classes/:id', component: academic.offering, props: (route) => ({ kind: 'class', id: String(route.params.id) }), meta: { title: 'academic.teachingClass', section: 'courses' } },
  { path: '/reviews/:id', component: academic.discussion, props: true, meta: { title: 'academic.discussion', section: 'courses' } },
  { path: '/resources', component: () => import('../features/resources/BrowseView.vue'), meta: { title: 'nav.resources', section: 'resources' } },
  { path: '/resources/new', component: () => import('../features/resources/EditorView.vue'), meta: { title: 'resources.upload', section: 'resources' } },
  { path: '/resources/items/:id', component: () => import('../features/resources/DetailView.vue'), props: true, meta: { title: 'resources.detailTitle', section: 'resources' } },
  { path: '/resources/items/:id/edit', component: () => import('../features/resources/EditorView.vue'), props: true, meta: { title: 'resources.edit', section: 'resources' } },
  { path: '/contributions', component: () => import('../features/storage/ContributionsView.vue'), meta: { title: 'nav.contributions', section: 'contributions' } },
  { path: '/me', component: () => import('../features/account/OverviewView.vue'), meta: { title: 'me.title', section: 'me' } },
  { path: '/me/reviews', component: () => import('../features/academic/MyReviewsView.vue'), meta: { title: 'me.reviews', section: 'me' } },
  { path: '/me/reviews/entries/:id', component: () => import('../features/academic/OwnEntryView.vue'), props: true, meta: { title: 'me.reviews', section: 'me' } },
  { path: '/me/resources', component: () => import('../features/resources/MyResourcesView.vue'), meta: { title: 'me.resources', section: 'me' } },
  { path: '/me/requests', component: () => import('../features/resources/RequestsView.vue'), meta: { title: 'me.requests', section: 'me' } },
  { path: '/me/verification', component: () => import('../features/verification/VerificationView.vue'), meta: { title: 'verification.title', section: 'me' } },
  { path: '/me/storage-accounts', component: () => import('../features/storage/CustodyView.vue'), meta: { title: 'custody.title', section: 'me' } },
  { path: '/verification/capture', component: () => import('../features/verification/CaptureView.vue'), meta: { title: 'verification.capture.title', section: 'me' } },
  // Earlier entry points keep working after the reorganisation.
  { path: '/community', redirect: (to) => ({ path: '/courses', query: to.query }) },
  { path: '/community/me', redirect: (to) => ({ path: '/me/reviews', query: to.query }) },
  { path: '/community/me/entries/:id', redirect: (to) => ({ path: `/me/reviews/entries/${encodeURIComponent(String(to.params.id))}`, query: to.query }) },
  { path: '/verification', redirect: (to) => ({ path: '/me/verification', query: to.query }) },
  { path: '/storage-accounts', redirect: (to) => ({ path: '/me/storage-accounts', query: to.query }) },
  { path: '/resources/me', redirect: (to) => ({ path: '/me/resources', query: to.query }) },
  { path: '/resources/requests', redirect: (to) => ({ path: '/me/requests', query: to.query }) },
  { path: '/:pathMatch(.*)*', component: NotFoundView, meta: { title: 'notFound.title' } },
]

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? { el: to.hash } : { top: 0 }),
  })
}
