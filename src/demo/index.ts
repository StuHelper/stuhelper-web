import { tr } from './tr'
import { extras } from '../shared/extras'
import Chrome from './pages/Chrome.vue'
import CompareTray from './pages/CompareTray.vue'
import Floating from './pages/Floating.vue'
import Insights from './pages/Insights.vue'
import SearchPalette from './pages/SearchPalette.vue'
import SubjectActions from './pages/SubjectActions.vue'
import { installDemoFetch, setPersona } from './server'
import './demo.css'

/** 只在 VITE_DEMO 下加载：替换网络层，登记原型页面和外壳附加组件。 */
export function installDemo() {
  installDemoFetch()
  extras.remountOnLocale = true
  extras.signIn = () => { setPersona('verified'); window.location.reload() }
  extras.navTools.push(SearchPalette, Chrome)
  extras.floating.push(Floating, CompareTray)
  extras.subjectActions.push(SubjectActions)
  extras.subjectPanels.push(Insights)
  const verified = { access: 'verified' as const }
  extras.routes.push(
    { path: '/compare', component: () => import('./pages/Compare.vue'), meta: { ...verified, title: 'nav.courses', section: 'courses' } },
    { path: '/', component: () => import('./pages/Home.vue'), meta: { title: 'nav.home', section: 'home' } },
    { path: '/courses', component: () => import('./pages/Directory.vue'), props: { kind: 'course' }, meta: { ...verified, title: 'nav.courses', section: 'courses' } },
    { path: '/teachers', component: () => import('./pages/Directory.vue'), props: { kind: 'teacher' }, meta: { ...verified, title: 'nav.teachers', section: 'teachers' } },
    { path: '/resources', component: () => import('./pages/Resources.vue'), meta: { ...verified, title: 'nav.resources', section: 'resources' } },
    { path: '/me', component: () => import('./pages/MeHome.vue'), meta: { title: 'me.title', section: 'me' } },
    { path: '/me/courses', component: () => import('./pages/Schedule.vue'), meta: { ...verified, title: 'courses.title', section: 'me' } },
    { path: '/notifications', component: () => import('./pages/Notifications.vue'), meta: { title: 'nav.home', section: 'me' } },
  )
}
