<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BadgeCheck, CalendarDays, ChevronRight, Code2, Coins, FileText, FolderOpen, HardDrive, Inbox, Link2, LogOut, PenLine, ShieldCheck, UserRoundCog, AppWindow } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MeLayout from '../../features/account/MeLayout.vue'
import AccessPanel from '../../features/account/AccessPanel.vue'
import { useAccess } from '../../features/account/access'
import { useSession } from '../../shared/session'
import PageSkeleton from '../../shared/ui/PageSkeleton.vue'
import { notices, relative } from '../store'
const { t: tr } = useI18n()

const session = useSession()
const todos = [
  { to: '/courses/c2', title: tr('demo.reviewTodo'), hint: tr('demo.lastTermDone'), icon: PenLine, tile: 'var(--c-indigo)' },
  { to: '/me/reviews?tab=drafts', title: tr('demo.draftTodo'), hint: '控制原理的学习建议', icon: FileText, tile: 'var(--c-orange)' },
]
const access = useAccess()
const verified = computed(() => access.state.value === 'verified')
const stats = [{ to: '/me/reviews', n: 1, text: tr('demo.reviews') }, { to: '/me/resources', n: 2, text: tr('demo.resourcesShort') }, { to: '/me/reviews?tab=bookmarks', n: 2, text: tr('demo.favorites') }, { to: '/me/wallet', n: 128, text: 'Ivory' }]
const groups = [
  { title: tr('demo.study'), rows: [{ to: '/me/courses', text: tr('demo.myCourses'), hint: tr('demo.coursesHint'), icon: CalendarDays, tile: 'var(--c-red)' }, { to: '/me/reviews', text: tr('demo.myReviews'), hint: tr('demo.reviewsHint'), icon: FileText, tile: 'var(--c-blue)' }, { to: '/me/resources', text: tr('demo.myResources'), hint: tr('demo.uploadStatusHint'), icon: FolderOpen, tile: 'var(--c-orange)' }, { to: '/me/requests', text: tr('demo.myRequests'), hint: tr('demo.requestsHint'), icon: Inbox, tile: 'var(--c-indigo)' }] },
  { title: tr('demo.accountSection'), rows: [{ to: '/me/profile', text: tr('demo.profile'), hint: tr('demo.profileHint'), icon: UserRoundCog, tile: 'var(--c-pink)' }, { to: '/me/verification', text: tr('demo.studentVerification'), hint: tr('demo.verificationValidHint'), icon: ShieldCheck, tile: 'var(--c-green)' }, { to: '/me/account', text: tr('demo.accountSecurity'), hint: tr('demo.accountHint'), icon: Link2, tile: 'var(--c-gray)' }, { to: '/me/wallet', text: tr('demo.walletTitle'), hint: tr('demo.walletHint'), icon: Coins, tile: '#ffb300' }] },
  { title: tr('demo.more'), rows: [{ to: '/me/apps', text: tr('demo.authorizedApps'), hint: tr('demo.appsHint'), icon: AppWindow, tile: 'var(--c-cyan)' }, { to: '/me/developer', text: tr('demo.developerPlatform'), hint: tr('demo.developerHint'), icon: Code2, tile: '#636366' }, { to: '/me/storage', text: tr('demo.storageContribution'), hint: tr('demo.storageHint'), icon: HardDrive, tile: 'var(--c-cyan)' }] },
]
</script>

<template>
  <MeLayout :title="tr('demo.personalCenter')">
    <PageSkeleton v-if="access.state.value === 'loading'" />
    <AccessPanel v-else-if="!verified" />
    <template v-if="session.state.value === 'member' && access.state.value !== 'loading'">
      <section class="card hero">
        <span class="face" aria-hidden="true">小</span>
        <div class="group-body">
          <p class="name">小航同学</p>
          <p class="row subtle"><BadgeCheck v-if="verified" class="ok" aria-hidden="true" />{{ verified ? tr('demo.beihangVerified') : tr('demo.notVerified') }}</p>
        </div>
        <RouterLink class="btn btn-sm" to="/me/profile">{{ tr('demo.edit') }}</RouterLink>
      </section>
      <nav v-if="verified" class="stats" :aria-label="tr('demo.myStats')">
        <RouterLink v-for="s in stats" :key="s.text" class="card stat" :to="s.to"><b class="d-stat">{{ s.n }}</b><span class="subtle">{{ s.text }}</span></RouterLink>
      </nav>
      <section v-if="verified" class="card stack desk-only" aria-labelledby="me-todo">
        <h2 id="me-todo" class="d-title">{{ tr('demo.todo') }}</h2>
        <RouterLink v-for="t in todos" :key="t.to" class="todo" :to="t.to"><span class="icon-tile" :style="{ '--tile': t.tile }"><component :is="t.icon" aria-hidden="true" /></span><span class="group-body"><b>{{ t.title }}</b><span class="subtle">{{ t.hint }}</span></span><ChevronRight class="chevron" aria-hidden="true" /></RouterLink>
      </section>
      <section v-if="verified" class="stack desk-only" aria-labelledby="me-recent">
        <div class="row-between"><h2 id="me-recent" class="d-title">{{ tr('demo.recentActivity') }}</h2><RouterLink class="small" to="/notifications">{{ tr('demo.allNotifications') }}</RouterLink></div>
        <ul class="group"><li v-for="n in notices.slice(0, 4)" :key="n.id"><RouterLink class="group-row" :to="n.to"><span class="group-body"><span class="group-title">{{ n.title }}</span><span class="group-detail clamp-2">{{ n.body }}</span></span><span class="subtle when">{{ relative(n.at) }}</span></RouterLink></li></ul>
      </section>
      <section v-for="g in groups" :key="g.title" class="section" :class="{ 'phone-only': verified }">
        <h2 class="caption">{{ g.title }}</h2>
        <ul class="group">
          <li v-for="r in g.rows" :key="r.to">
            <RouterLink class="group-row has-icon" :to="r.to">
              <span class="icon-tile" :style="{ '--tile': r.tile }"><component :is="r.icon" aria-hidden="true" /></span>
              <span class="group-body"><span class="group-title">{{ r.text }}</span><span class="group-detail">{{ r.hint }}</span></span>
              <ChevronRight class="chevron" aria-hidden="true" />
            </RouterLink>
          </li>
        </ul>
      </section>
      <button class="btn phone-only" type="button" @click="session.signOut(false)"><LogOut aria-hidden="true" />{{ tr('demo.signOut') }}</button>
    </template>
  </MeLayout>
</template>

<style scoped>
.hero { display: flex; align-items: center; gap: 1rem; }
.face { display: grid; flex: none; place-items: center; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(145deg, #5e9cff, var(--c-blue)); color: #fff; font-size: 1.5rem; font-weight: 600; }
.name { font-size: 1.3125rem; font-weight: 650; }
.ok { width: 1rem; height: 1rem; color: var(--accent); }
.subtle.row { gap: .25rem; }
.stats { display: grid; gap: .75rem; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stat { display: grid; gap: .125rem; padding: .875rem 1rem; color: inherit; transition: transform .3s var(--spring); }
.stat:hover { text-decoration: none; transform: translateY(-2px); }
.todo { display: flex; align-items: center; gap: .75rem; color: inherit; }
.todo:hover { text-decoration: none; }
.todo:hover b { color: var(--accent); }
.todo b { font-size: .9375rem; font-weight: 550; }
.when { flex: none; }
.desk-only { display: grid; }
.phone-only { display: none; }
/* 手机上没有侧栏，这个页面就是菜单。 */
@media (max-width: 760px) { .desk-only { display: none; } .phone-only { display: grid; } .btn.phone-only { display: inline-flex; } }
.section { gap: .5rem; }
.section .caption { padding-inline: 1.125rem; }
@media (max-width: 480px) { .stats { gap: .5rem; } .stat { padding: .75rem; } }
</style>
