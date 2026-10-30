<script setup lang="ts">
import { BookOpen, Copy, Plus } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../store'

const scopes = ['读取基本资料', '读取我的课表', '读取课程目录', '读取公开评价']
const apps = ref([
  { id: 'cli_7f3a91', name: '航课表小组件', state: 'approved', users: 214, redirect: 'https://example.invalid/callback', scopes: ['读取基本资料', '读取我的课表'] },
  { id: 'cli_c20e44', name: '评价导出工具', state: 'review', users: 0, redirect: 'https://example.invalid/cb', scopes: ['读取公开评价'] },
])
const stateText: Record<string, [string, string]> = { approved: ['已上线', 'tag-success'], review: ['审核中', 'tag-info'], rejected: ['未通过', 'tag-danger'] }
const creating = ref(false)
const form = reactive({ name: '', redirect: '', scopes: [] as string[] })
const urlOk = () => /^https:\/\//.test(form.redirect)
function create() { apps.value.unshift({ id: `cli_${Math.random().toString(16).slice(2, 8)}`, name: form.name, state: 'review', users: 0, redirect: form.redirect, scopes: [...form.scopes] }); creating.value = false; form.name = ''; form.redirect = ''; form.scopes = []; toast('应用已提交审核') }
function copy(id: string) { void navigator.clipboard?.writeText(id).catch(() => undefined); toast('Client ID 已复制') }
</script>

<template>
  <MeLayout title="开放平台" description="用 StuHelper 账号登录你的应用，并在同学同意后读取数据。">
    <template #actions>
      <button class="btn btn-sm" type="button" @click="toast('原型未包含接口文档')"><BookOpen aria-hidden="true" />接口文档</button>
      <button class="btn btn-sm btn-primary" type="button" @click="creating = true"><Plus aria-hidden="true" />创建应用</button>
    </template>
    <ul class="list">
      <li v-for="a in apps" :key="a.id" class="card stack">
        <div class="row-between"><b class="d-title">{{ a.name }}</b><span class="tag" :class="stateText[a.state]![1]">{{ stateText[a.state]![0] }}</span></div>
        <dl class="facts">
          <div><dt>Client ID</dt><dd class="row"><code>{{ a.id }}</code><button class="btn btn-icon copy" type="button" :aria-label="`复制 ${a.name} 的 Client ID`" @click="copy(a.id)"><Copy aria-hidden="true" /></button></dd></div>
          <div><dt>授权用户</dt><dd>{{ a.users }} 人</dd></div>
          <div><dt>回调地址</dt><dd class="small">{{ a.redirect }}</dd></div>
        </dl>
        <div class="row"><span v-for="s in a.scopes" :key="s" class="tag">{{ s }}</span></div>
      </li>
    </ul>
    <SheetDialog :open="creating" title="创建应用" description="提交后由管理员审核，通过后才能被其他同学授权。" @close="creating = false">
      <label class="field"><span class="field-label">应用名称</span><input v-model="form.name" class="input" maxlength="30"></label>
      <label class="field"><span class="field-label">回调地址</span><input v-model="form.redirect" class="input" inputmode="url" placeholder="https://" :aria-invalid="!!form.redirect && !urlOk()"><span v-if="form.redirect && !urlOk()" class="field-error">回调地址必须以 https:// 开头。</span></label>
      <fieldset class="stack-sm"><legend class="field-label">申请的权限</legend><label v-for="s in scopes" :key="s" class="row"><input v-model="form.scopes" class="pick" type="checkbox" :value="s"><span>{{ s }}</span></label></fieldset>
      <div class="form-actions"><button class="btn btn-primary" type="button" :disabled="!form.name.trim() || !urlOk() || !form.scopes.length" @click="create">提交审核</button><button class="btn" type="button" @click="creating = false">取消</button></div>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
code { font-family: var(--mono); font-size: .875rem; }
.copy { width: 28px; min-height: 28px; background: transparent; color: var(--label-3); }
.copy svg { width: 14px; height: 14px; }
</style>
