import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import NotFoundView from './views/NotFoundView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/storage-accounts', component: () => import('./views/CustodyView.vue') },
    { path: '/contributions', component: () => import('./views/ContributionsView.vue') },
    { path: '/:pathMatch(.*)*', component: NotFoundView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
