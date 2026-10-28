import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import NotFoundView from './views/NotFoundView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/community', component: () => import('./academic/CommunityView.vue') },
    { path: '/courses', component: () => import('./academic/DirectoryView.vue') },
    { path: '/teachers', component: () => import('./academic/DirectoryView.vue') },
    { path: '/courses/:id', component: () => import('./academic/DetailView.vue') },
    { path: '/teachers/:id', component: () => import('./academic/DetailView.vue') },
    { path: '/offerings/:id', component: () => import('./academic/OfferingView.vue') },
    { path: '/classes/:id', component: () => import('./academic/OfferingView.vue') },
    { path: '/reviews/:id', component: () => import('./academic/DiscussionView.vue') },
    { path: '/community/me', component: () => import('./academic/PersonalView.vue') },
    { path: '/community/me/entries/:id', component: () => import('./academic/OwnEntryView.vue') },
    { path: '/:pathMatch(.*)*', component: NotFoundView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
