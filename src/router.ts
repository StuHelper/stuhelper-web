import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import NotFoundView from './views/NotFoundView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/verification', component: () => import('./views/VerificationView.vue') },
    { path: '/verification/capture', component: () => import('./views/VerificationCaptureView.vue') },
    { path: '/:pathMatch(.*)*', component: NotFoundView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
