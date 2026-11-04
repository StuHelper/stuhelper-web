<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BellOff, CheckCheck, MessageCircle, FolderOpen, Megaphone, ShieldCheck, Coins, Settings2 } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AccessPanel from '../../features/account/AccessPanel.vue'
import { useSession } from '../../shared/session'
import PageHeader from '../../shared/ui/PageHeader.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { notices, relative, toast, unread, type Notice } from '../store'
const { t: tr } = useI18n()
const session = useSession()

const filter = ref<'all' | 'unread' | Notice['kind']>('all')
const settings = ref(false)
const prefs = reactive([{ key: tr('demo.prefReplies'), on: true }, { key: tr('demo.prefReviewResults'), on: true }, { key: tr('demo.prefVerificationExpiry'), on: true }, { key: tr('demo.prefPoints'), on: true }, { key: tr('demo.prefAnnouncements'), on: false }])
const icons = { review: [MessageCircle, 'var(--c-blue)'], resource: [FolderOpen, 'var(--c-orange)'], system: [Megaphone, 'var(--c-indigo)'], account: [ShieldCheck, 'var(--c-green)'], wallet: [Coins, '#ffb300'] } as const
const rows = computed(() => notices.filter((n) => filter.value === 'all' || (filter.value === 'unread' ? !n.read : n.kind === filter.value)))
const tabs = [['all', tr('demo.all')], ['unread', tr('demo.unread')], ['review', tr('demo.interactions')], ['resource', tr('demo.resourcesShort')], ['account', tr('demo.accountSection')], ['wallet', tr('demo.points')], ['system', tr('demo.announcements')]] as const
function readAll() { notices.forEach((n) => { n.read = true }); toast(tr('demo.allMarkedRead')) }
</script>

<template>
  <AccessPanel v-if="session.state.value !== 'member'" gate />
  <div v-else class="stack-lg reading">
    <PageHeader :title="tr('demo.notifications')" :description="unread ? tr('demo.unreadCount', { p0: unread }) : tr('demo.allCaughtUp')">
      <template #actions>
        <button class="btn btn-sm" type="button" :disabled="!unread" @click="readAll"><CheckCheck aria-hidden="true" />{{ tr('demo.markAllRead') }}</button>
        <button class="btn btn-sm btn-icon" type="button" :aria-label="tr('demo.notificationSettings')" @click="settings = true"><Settings2 aria-hidden="true" /></button>
      </template>
    </PageHeader>
    <div class="d-chips" role="group" :aria-label="tr('demo.notificationKind')">
      <button v-for="[value, text] in tabs" :key="value" class="d-chip" type="button" :aria-pressed="filter === value" @click="filter = value">{{ text }}</button>
    </div>
    <div v-if="!rows.length" class="card empty stack"><BellOff class="off" aria-hidden="true" /><p>{{ tr('demo.noNotifications') }}</p></div>
    <ul v-else class="group">
      <li v-for="n in rows" :key="n.id">
        <RouterLink class="group-row has-icon note" :class="{ unread: !n.read }" :to="n.to" @click="n.read = true">
          <span class="icon-tile" :style="{ '--tile': icons[n.kind][1] }"><component :is="icons[n.kind][0]" aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">{{ n.title }}</span><span class="group-detail clamp-2">{{ n.body }}</span><span class="subtle">{{ relative(n.at) }}</span></span>
          <span v-if="!n.read" class="dot"><span class="visually-hidden">{{ tr('demo.unread') }}</span></span>
        </RouterLink>
      </li>
    </ul>
    <SheetDialog :open="settings" :title="tr('demo.notificationSettings')" :description="tr('demo.notifySettingsHint')" @close="settings = false">
      <label v-for="p in prefs" :key="p.key" class="check"><input v-model="p.on" type="checkbox"><span>{{ p.key }}</span></label>
      <div class="form-actions"><button class="btn btn-primary" type="button" @click="settings = false; toast(tr('demo.settingsSaved'))">{{ tr('demo.done') }}</button></div>
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
