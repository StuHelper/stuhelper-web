import { AppWindow, Code2, Coins, Link2, UserRoundCog } from 'lucide-vue-next'
import { extras } from '../shared/extras'
import Chrome from './pages/Chrome.vue'
import Floating from './pages/Floating.vue'
import { installDemoFetch, setPersona } from './server'
import './demo.css'

/** 只在 VITE_DEMO 下加载：替换网络层，登记原型页面和外壳附加组件。 */
export function installDemo() {
  installDemoFetch()
  extras.signIn = () => { setPersona('verified'); window.location.reload() }
  extras.navTools.push(Chrome)
  extras.floating.push(Floating)
  extras.meLinks.push(
    { to: '/me/profile', text: '个人资料', icon: UserRoundCog, tile: '#ff2d55' },
    { to: '/me/account', text: '账号与绑定', icon: Link2, tile: '#8e8e93' },
    { to: '/me/wallet', text: '积分与 Ivory', icon: Coins, tile: '#ffb300' },
    { to: '/me/apps', text: '授权应用', icon: AppWindow, tile: '#32ade6' },
    { to: '/me/developer', text: '开放平台', icon: Code2, tile: '#1d1d1f' },
  )
  const verified = { access: 'verified' as const }
  extras.routes.push(
    { path: '/', component: () => import('./pages/Home.vue'), meta: { title: 'nav.home', section: 'home' } },
    { path: '/courses', component: () => import('./pages/Directory.vue'), props: { kind: 'course' }, meta: { ...verified, title: 'nav.courses', section: 'courses' } },
    { path: '/teachers', component: () => import('./pages/Directory.vue'), props: { kind: 'teacher' }, meta: { ...verified, title: 'nav.teachers', section: 'teachers' } },
    { path: '/resources', component: () => import('./pages/Resources.vue'), meta: { ...verified, title: 'nav.resources', section: 'resources' } },
    { path: '/me', component: () => import('./pages/MeHome.vue'), meta: { title: 'me.title', section: 'me' } },
    { path: '/me/courses', component: () => import('./pages/Schedule.vue'), meta: { ...verified, title: 'courses.title', section: 'me' } },
    { path: '/notifications', component: () => import('./pages/Notifications.vue'), meta: { title: 'nav.home', section: 'me' } },
    { path: '/me/profile', component: () => import('./pages/Profile.vue'), meta: { title: 'me.title', section: 'me' } },
    { path: '/me/account', component: () => import('./pages/Account.vue'), meta: { title: 'me.title', section: 'me' } },
    { path: '/me/wallet', component: () => import('./pages/Wallet.vue'), meta: { title: 'me.title', section: 'me' } },
    { path: '/me/apps', component: () => import('./pages/Apps.vue'), meta: { title: 'me.title', section: 'me' } },
    { path: '/me/developer', component: () => import('./pages/Developer.vue'), meta: { title: 'me.title', section: 'me' } },
  )
}
