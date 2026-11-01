<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import { toast } from '../store'
const { t: tr } = useI18n()

const apps = ref([
  { id: 'a1', name: '航课表小组件', by: '学生开发者 · 云上工作室', scopes: [tr('demo.scopeTimetable'), tr('demo.scopeProfile')], at: '2026 年 9 月 2 日', last: '今天', tile: 'var(--c-red)' },
  { id: 'a2', name: '选课助手', by: '学生开发者 · 不周山', scopes: [tr('demo.scopeCatalog'), tr('demo.scopePublicReviews')], at: '2026 年 6 月 18 日', last: '3 周前', tile: 'var(--c-blue)' },
])
const target = ref<(typeof apps.value)[number]>()
function revoke() { apps.value = apps.value.filter((a) => a.id !== target.value?.id); toast(tr('demo.appRevoked', { p0: target.value?.name })); target.value = undefined }
</script>

<template>
  <MeLayout :title="tr('demo.authorizedApps')" :description="tr('demo.appsDescription')">
    <p v-if="!apps.length" class="card empty">{{ tr('demo.noAuthorizedApps') }}</p>
    <ul v-else class="list">
      <li v-for="a in apps" :key="a.id" class="card stack">
        <div class="row nowrap">
          <span class="logo" :style="{ background: a.tile }" aria-hidden="true">{{ a.name[0] }}</span>
          <div class="group-body"><b>{{ a.name }}</b><span class="subtle">{{ a.by }}</span></div>
          <button class="btn btn-sm btn-danger" type="button" @click="target = a">{{ tr('demo.revokeAccess') }}</button>
        </div>
        <div class="row"><span v-for="s in a.scopes" :key="s" class="tag">{{ s }}</span></div>
        <p class="subtle">{{ tr('demo.authorizedLastUsed', { p0: a.at, p1: a.last }) }}</p>
      </li>
    </ul>
    <ConfirmDialog :open="!!target" :title="tr('demo.revokeApp', { p0: target?.name })" :message="tr('demo.revokeAppHint')" :confirm-label="tr('demo.revokeAccess')" danger @confirm="revoke" @cancel="target = undefined" />
  </MeLayout>
</template>

<style scoped>
.nowrap { flex-wrap: nowrap; gap: .75rem; }
.logo { display: grid; flex: none; place-items: center; width: 44px; height: 44px; border-radius: 11px; color: #fff; font-weight: 650; }
</style>
