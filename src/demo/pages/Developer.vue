<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BookOpen, Copy, Plus } from 'lucide-vue-next'
import { reactive, ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../store'
const { t: tr } = useI18n()

const scopes = [tr('demo.scopeProfile'), tr('demo.scopeTimetable'), tr('demo.scopeCatalog'), tr('demo.scopePublicReviews')]
const apps = ref([
  { id: 'cli_7f3a91', name: '航课表小组件', state: 'approved', users: 214, redirect: 'https://example.invalid/callback', scopes: [tr('demo.scopeProfile'), tr('demo.scopeTimetable')] },
  { id: 'cli_c20e44', name: '评价导出工具', state: 'review', users: 0, redirect: 'https://example.invalid/cb', scopes: [tr('demo.scopePublicReviews')] },
])
const stateText: Record<string, [string, string]> = { approved: [tr('demo.live'), 'tag-success'], review: [tr('demo.inReview'), 'tag-info'], rejected: [tr('demo.rejected'), 'tag-danger'] }
const creating = ref(false)
const form = reactive({ name: '', redirect: '', scopes: [] as string[] })
const urlOk = () => /^https:\/\//.test(form.redirect)
function create() { apps.value.unshift({ id: `cli_${Math.random().toString(16).slice(2, 8)}`, name: form.name, state: 'review', users: 0, redirect: form.redirect, scopes: [...form.scopes] }); creating.value = false; form.name = ''; form.redirect = ''; form.scopes = []; toast(tr('demo.appSubmitted')) }
function copy(id: string) { void navigator.clipboard?.writeText(id).catch(() => undefined); toast(tr('demo.clientIdCopied')) }
</script>

<template>
  <MeLayout :title="tr('demo.developerPlatform')" :description="tr('demo.developerDescription')">
    <template #actions>
      <button class="btn btn-sm" type="button" @click="toast(tr('demo.docsMissing'))"><BookOpen aria-hidden="true" />{{ tr('demo.apiDocs') }}</button>
      <button class="btn btn-sm btn-primary" type="button" @click="creating = true"><Plus aria-hidden="true" />{{ tr('demo.createApp') }}</button>
    </template>
    <ul class="list">
      <li v-for="a in apps" :key="a.id" class="card stack">
        <div class="row-between"><b class="d-title">{{ a.name }}</b><span class="tag" :class="stateText[a.state]![1]">{{ stateText[a.state]![0] }}</span></div>
        <dl class="facts">
          <div><dt>Client ID</dt><dd class="row"><code>{{ a.id }}</code><button class="btn btn-icon copy" type="button" :aria-label="tr('demo.copyClientId', { p0: a.name })" @click="copy(a.id)"><Copy aria-hidden="true" /></button></dd></div>
          <div><dt>{{ tr('demo.authorizedUsers') }}</dt><dd>{{ tr('demo.peopleCount', { p0: a.users }) }}</dd></div>
          <div><dt>{{ tr('demo.redirectUri') }}</dt><dd class="small">{{ a.redirect }}</dd></div>
        </dl>
        <div class="row"><span v-for="s in a.scopes" :key="s" class="tag">{{ s }}</span></div>
      </li>
    </ul>
    <SheetDialog :open="creating" :title="tr('demo.createApp')" :description="tr('demo.createAppHint')" @close="creating = false">
      <label class="field"><span class="field-label">{{ tr('demo.appName') }}</span><input v-model="form.name" class="input" maxlength="30"></label>
      <label class="field"><span class="field-label">{{ tr('demo.redirectUri') }}</span><input v-model="form.redirect" class="input" inputmode="url" placeholder="https://" :aria-invalid="!!form.redirect && !urlOk()"><span v-if="form.redirect && !urlOk()" class="field-error">{{ tr('demo.redirectInvalid') }}</span></label>
      <fieldset class="stack-sm"><legend class="field-label">{{ tr('demo.requestedScopes') }}</legend><label v-for="s in scopes" :key="s" class="row"><input v-model="form.scopes" class="pick" type="checkbox" :value="s"><span>{{ s }}</span></label></fieldset>
      <div class="form-actions"><button class="btn btn-primary" type="button" :disabled="!form.name.trim() || !urlOk() || !form.scopes.length" @click="create">{{ tr('demo.submitReview') }}</button><button class="btn" type="button" @click="creating = false">{{ tr('demo.cancel') }}</button></div>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
code { font-family: var(--mono); font-size: .875rem; }
.copy { width: 28px; min-height: 28px; background: transparent; color: var(--label-3); }
.copy svg { width: 14px; height: 14px; }
</style>
