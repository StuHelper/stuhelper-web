<script setup lang="ts">
import { BadgeCheck, CalendarDays, ChevronRight, Code2, Coins, FileText, FolderOpen, HardDrive, Inbox, Link2, LogOut, ShieldCheck, UserRoundCog, AppWindow } from 'lucide-vue-next'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MeLayout from '../../features/account/MeLayout.vue'
import AccessPanel from '../../features/account/AccessPanel.vue'
import { useAccess } from '../../features/account/access'
import { useSession } from '../../shared/session'

const session = useSession()
const access = useAccess()
const verified = computed(() => access.state.value === 'verified')
const stats = [{ to: '/me/reviews', n: 1, text: '评价' }, { to: '/me/resources', n: 2, text: '资料' }, { to: '/me/reviews?tab=bookmarks', n: 2, text: '收藏' }, { to: '/me/wallet', n: 128, text: 'Ivory' }]
const groups = [
  { title: '学习', rows: [{ to: '/me/courses', text: '我的课程', hint: '课表和选课记录', icon: CalendarDays, tile: '#ff3b30' }, { to: '/me/reviews', text: '我的评价', hint: '已发布、草稿和收藏', icon: FileText, tile: '#0071e3' }, { to: '/me/resources', text: '我的资料', hint: '上传和审核状态', icon: FolderOpen, tile: '#ff9500' }, { to: '/me/requests', text: '我的申请', hint: '下架、投诉和异议', icon: Inbox, tile: '#5856d6' }] },
  { title: '账号', rows: [{ to: '/me/profile', text: '个人资料', hint: '昵称、头像和公开主页', icon: UserRoundCog, tile: '#ff2d55' }, { to: '/me/verification', text: '学生认证', hint: '当前有效，至 2027 年 7 月', icon: ShieldCheck, tile: '#34c759' }, { to: '/me/account', text: '账号与绑定', hint: '手机号、QQ 和登录设备', icon: Link2, tile: '#8e8e93' }, { to: '/me/wallet', text: '积分与 Ivory', hint: '余额 128，有 20 即将到期', icon: Coins, tile: '#ffb300' }] },
  { title: '更多', rows: [{ to: '/me/apps', text: '授权应用', hint: '已授权 2 个应用', icon: AppWindow, tile: '#32ade6' }, { to: '/me/developer', text: '开放平台', hint: '创建和管理你的应用', icon: Code2, tile: '#1d1d1f' }, { to: '/me/storage-accounts', text: '存储账号', hint: '网盘账号托管授权', icon: HardDrive, tile: '#32ade6' }] },
]
</script>

<template>
  <MeLayout title="个人中心">
    <AccessPanel v-if="!verified" />
    <template v-if="session.state.value === 'member'">
      <section class="card hero">
        <span class="face" aria-hidden="true">小</span>
        <div class="group-body">
          <p class="name">小航同学</p>
          <p class="row subtle"><BadgeCheck v-if="verified" class="ok" aria-hidden="true" />{{ verified ? '北京航空航天大学 · 已认证学生' : '尚未完成学生认证' }}</p>
        </div>
        <RouterLink class="btn btn-sm" to="/me/profile">编辑</RouterLink>
      </section>
      <nav v-if="verified" class="stats" aria-label="我的数据">
        <RouterLink v-for="s in stats" :key="s.text" class="card stat" :to="s.to"><b class="d-stat">{{ s.n }}</b><span class="subtle">{{ s.text }}</span></RouterLink>
      </nav>
      <section v-for="g in groups" :key="g.title" class="section">
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
      <button class="btn" type="button" @click="session.signOut(false)"><LogOut aria-hidden="true" />退出登录</button>
    </template>
  </MeLayout>
</template>

<style scoped>
.hero { display: flex; align-items: center; gap: 1rem; }
.face { display: grid; flex: none; place-items: center; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(145deg, #5e9cff, #0071e3); color: #fff; font-size: 1.5rem; font-weight: 600; }
.name { font-size: 1.3125rem; font-weight: 650; }
.ok { width: 1rem; height: 1rem; color: var(--accent); }
.subtle.row { gap: .25rem; }
.stats { display: grid; gap: .75rem; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.stat { display: grid; gap: .125rem; padding: .875rem 1rem; color: inherit; transition: transform .3s var(--spring); }
.stat:hover { text-decoration: none; transform: translateY(-2px); }
.section { gap: .5rem; }
.section .caption { padding-inline: 1.125rem; }
@media (max-width: 480px) { .stats { gap: .5rem; } .stat { padding: .75rem; } }
</style>
