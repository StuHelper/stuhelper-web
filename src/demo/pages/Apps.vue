<script setup lang="ts">
import { ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import { toast } from '../store'

const apps = ref([
  { id: 'a1', name: '航课表小组件', by: '学生开发者 · 云上工作室', scopes: ['读取我的课表', '读取基本资料'], at: '2026 年 9 月 2 日', last: '今天', tile: '#ff3b30' },
  { id: 'a2', name: '选课助手', by: '学生开发者 · 不周山', scopes: ['读取课程目录', '读取公开评价'], at: '2026 年 6 月 18 日', last: '3 周前', tile: '#0071e3' },
])
const target = ref<(typeof apps.value)[number]>()
function revoke() { apps.value = apps.value.filter((a) => a.id !== target.value?.id); toast(`已撤销 ${target.value?.name} 的授权`); target.value = undefined }
</script>

<template>
  <MeLayout title="授权应用" description="这些应用可以按你同意的范围读取数据，随时可以撤销。">
    <p v-if="!apps.length" class="card empty">你还没有授权任何应用。</p>
    <ul v-else class="list">
      <li v-for="a in apps" :key="a.id" class="card stack">
        <div class="row nowrap">
          <span class="logo" :style="{ background: a.tile }" aria-hidden="true">{{ a.name[0] }}</span>
          <div class="group-body"><b>{{ a.name }}</b><span class="subtle">{{ a.by }}</span></div>
          <button class="btn btn-sm btn-danger" type="button" @click="target = a">撤销</button>
        </div>
        <div class="row"><span v-for="s in a.scopes" :key="s" class="tag">{{ s }}</span></div>
        <p class="subtle">{{ a.at }} 授权 · 最近使用 {{ a.last }}</p>
      </li>
    </ul>
    <ConfirmDialog :open="!!target" :title="`撤销 ${target?.name}？`" message="撤销后该应用立即无法读取你的数据，再次使用需要重新授权。" confirm-label="撤销授权" danger @confirm="revoke" @cancel="target = undefined" />
  </MeLayout>
</template>

<style scoped>
.nowrap { flex-wrap: nowrap; gap: .75rem; }
.logo { display: grid; flex: none; place-items: center; width: 44px; height: 44px; border-radius: 11px; color: #fff; font-weight: 650; }
</style>
