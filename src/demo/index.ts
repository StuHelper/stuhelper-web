import { tr } from './tr'
import { extras } from '../shared/extras'
import Chrome from './pages/Chrome.vue'
import Floating from './pages/Floating.vue'
import { installDemoFetch, setPersona } from './server'
import { chatThreads } from './chat'
import './demo.css'

/** 只在 VITE_DEMO 下加载：替换网络层，登记原型页面和外壳附加组件。 */
export function installDemo() {
  installDemoFetch()
  extras.remountOnLocale = true
  extras.signIn = () => { setPersona('verified'); window.location.reload() }
  extras.navTools.push(Chrome)
  extras.floating.push(Floating)
  extras.threads.push(...chatThreads())
  const verified = { access: 'verified' as const }
  extras.routes.push(
    { path: '/campus', component: () => import('./pages/Home.vue'), meta: { title: 'nav.campus', section: 'home' } },
    { path: '/courses', component: () => import('./pages/Directory.vue'), props: { kind: 'course' }, meta: { ...verified, title: 'nav.courses', section: 'courses' } },
    { path: '/teachers', component: () => import('./pages/Directory.vue'), props: { kind: 'teacher' }, meta: { ...verified, title: 'nav.teachers', section: 'teachers' } },
    { path: '/resources', component: () => import('./pages/Resources.vue'), meta: { ...verified, title: 'nav.resources', section: 'resources' } },
    { path: '/notifications/chats/:id', component: () => import('./pages/Chat.vue'), props: true, meta: { remountOnPath: true, access: 'member' as const, title: 'notifications.title', section: 'me' } },
    { path: '/me', component: () => import('./pages/MeHome.vue'), meta: { title: 'me.title', section: 'me' } },
  )
}
