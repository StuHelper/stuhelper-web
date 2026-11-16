import { tr } from './tr'
import { extras } from '../shared/extras'
import Floating from './pages/Floating.vue'
import { installDemoFetch, setPersona } from './server'
import { chatThreads } from './chat'

/** 只在 VITE_DEMO 下加载：替换网络层，登记原型页面和外壳附加组件。 */
export function installDemo() {
  installDemoFetch()
  extras.remountOnLocale = true
  extras.signIn = () => { setPersona('verified'); window.location.reload() }
  extras.floating.push(Floating)
  extras.threads.push(...chatThreads())
  extras.routes.push(
    { path: '/notifications/chats/:id', component: () => import('./pages/Chat.vue'), props: true, meta: { remountOnPath: true, access: 'member' as const, title: 'notifications.title', section: 'me' } },
  )
}
