<script setup lang="ts">
import { BellOff, CheckCheck, MessageCircle, FolderOpen, Megaphone, ShieldCheck, Coins, Settings2 } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { notices, relative, toast, unread, type Notice } from '../store'

const filter = ref<'all' | 'unread' | Notice['kind']>('all')
const settings = ref(false)
const prefs = reactive([{ key: '回复和赞同', on: true }, { key: '审核与申请结果', on: true }, { key: '认证到期提醒', on: true }, { key: '积分变动', on: true }, { key: '平台公告', on: false }])
const icons = { review: [MessageCircle, '#0071e3'], resource: [FolderOpen, '#ff9500'], system: [Megaphone, '#5856d6'], account: [ShieldCheck, '#34c759'], wallet: [Coins, '#ffb300'] } as const
const rows = computed(() => notices.filter((n) => filter.value === 'all' || (filter.value === 'unread' ? !n.read : n.kind === filter.value)))
const tabs = [['all', '全部'], ['unread', '未读'], ['review', '互动'], ['resource', '资料'], ['account', '账号'], ['wallet', '积分'], ['system', '公告']] as const
function readAll() { notices.forEach((n) => { n.read = true }); toast('已全部标记为已读') }
</script>

<template>
  <div class="stack-lg reading">
    <PageHeader title="通知" :description="unread ? `${unread} 条未读` : '都看完了'">
      <template #actions>
        <button class="btn btn-sm" type="button" :disabled="!unread" @click="readAll"><CheckCheck aria-hidden="true" />全部已读</button>
        <button class="btn btn-sm btn-icon" type="button" aria-label="通知设置" @click="settings = true"><Settings2 aria-hidden="true" /></button>
      </template>
    </PageHeader>
    <div class="d-chips" role="group" aria-label="通知分类">
      <button v-for="[value, text] in tabs" :key="value" class="d-chip" type="button" :aria-pressed="filter === value" @click="filter = value">{{ text }}</button>
    </div>
    <div v-if="!rows.length" class="card empty stack"><BellOff class="off" aria-hidden="true" /><p>这里还没有通知。</p></div>
    <ul v-else class="group">
      <li v-for="n in rows" :key="n.id">
        <RouterLink class="group-row has-icon note" :class="{ unread: !n.read }" :to="n.to" @click="n.read = true">
          <span class="icon-tile" :style="{ '--tile': icons[n.kind][1] }"><component :is="icons[n.kind][0]" aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">{{ n.title }}</span><span class="group-detail clamp-2">{{ n.body }}</span><span class="subtle">{{ relative(n.at) }}</span></span>
          <span v-if="!n.read" class="dot"><span class="visually-hidden">未读</span></span>
        </RouterLink>
      </li>
    </ul>
    <SheetDialog :open="settings" title="通知设置" description="关闭后仍可在这里查看安全相关的通知。" @close="settings = false">
      <label v-for="p in prefs" :key="p.key" class="check"><input v-model="p.on" type="checkbox"><span>{{ p.key }}</span></label>
      <div class="form-actions"><button class="btn btn-primary" type="button" @click="settings = false; toast('通知设置已保存')">完成</button></div>
    </SheetDialog>
  </div>
</template>

<style scoped>
.reading { max-width: var(--reading); margin-inline: auto; }
.note { align-items: flex-start; }
.note .group-title { font-weight: 500; }
.note.unread .group-title { font-weight: 650; }
.dot { flex: none; align-self: center; width: 9px; height: 9px; border-radius: 50%; background: var(--accent-fill); }
.off { justify-self: center; width: 2rem; height: 2rem; }
</style>
