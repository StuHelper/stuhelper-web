<script setup lang="ts">
import { Copy, Plus } from 'lucide-vue-next'
import { computed, reactive, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useMutation, usePaged } from '../../shared/composables/async'
import { useLeaveGuard } from '../../shared/composables/leave'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import MeLayout from '../account/MeLayout.vue'
import { redirectProblem, scopes, usePlatformApi, type Application, type ApplicationInput, type Credential, type Notice } from './api'

// Applications the signed-in developer submitted. An application grants nothing until an
// administrator approves its scopes, and each user still consents scope by scope.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = usePlatformApi()
const apps = usePaged<Application>((after, signal) => api.apps(after, signal))
void apps.reload()
const stateTone = (state: Application['state']) => (state === 'active' ? 'success' : state === 'changes_requested' ? 'warning' : state === 'suspended' ? 'danger' : 'info')
function replace(app: Application) {
  const exists = apps.items.value.some((item) => item.id === app.id)
  apps.items.value = exists ? apps.items.value.map((item) => (item.id === app.id ? app : item)) : [app, ...apps.items.value]
}
async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(message)
  } catch {
    toast(t('platform.developer.copyFailed'))
  }
}

// Create or resubmit. Resubmitting sends the current revision; the new content is reviewed again.
const editing = shallowRef<Application | 'new'>()
const form = reactive({ name: '', purpose: '', redirects: '', clientType: 'confidential' as Application['client_type'], scopes: [] as Application['requested_scopes'] })
const baseline = ref('')
const write = useMutation()
const redirectList = computed(() => form.redirects.split('\n').map((line) => line.trim()).filter(Boolean))
const redirectError = computed(() => {
  if (redirectList.value.length > 10) return t('platform.developer.tooManyRedirects')
  const problem = redirectList.value.map(redirectProblem).find(Boolean)
  return problem ? t(`platform.developer.redirectProblem.${problem}`) : ''
})
const formValid = computed(() => !!form.name.trim() && [...form.name.trim()].length <= 80 && !!form.purpose.trim() && redirectList.value.length > 0 && !redirectError.value && form.scopes.length > 0)
const dirty = computed(() => !!editing.value && JSON.stringify(form) !== baseline.value)
useLeaveGuard(() => (write.uncertain.value ? t('common.leaveUncertain') : dirty.value || write.busy.value ? t('common.leaveUnsaved') : ''))
function edit(app?: Application) {
  Object.assign(form, app
    ? { name: app.name, purpose: app.purpose, redirects: app.redirect_uris.join('\n'), clientType: app.client_type, scopes: [...app.requested_scopes] }
    : { name: '', purpose: '', redirects: '', clientType: 'confidential', scopes: [] })
  baseline.value = JSON.stringify(form)
  editing.value = app ?? 'new'
}
function input(): ApplicationInput {
  const current = editing.value
  return { name: form.name.trim(), purpose: form.purpose.trim(), redirect_uris: redirectList.value, requested_scopes: scopes.filter((scope) => form.scopes.includes(scope)), client_type: form.clientType, ...(current && current !== 'new' ? { revision: current.revision } : {}) }
}
async function save() {
  const current = editing.value
  if (!current || !formValid.value) return
  const body = input()
  const result = current === 'new'
    ? await write.run('app:create', body, (value, key) => api.create(value, key))
    : await write.run(`app:${current.id}:submit`, body, (value, key) => api.submit(current.id, value, key))
  if (result) saved(result)
}
async function retrySave() {
  const result = await write.retry()
  // The retried request is the original create or submit and returns the Application.
  if (result) saved(result as Application)
}
function saved(app: Application) {
  replace(app)
  editing.value = undefined
  toast(t('platform.developer.submitted', { name: app.name }))
}
function closeEditor() {
  if (write.busy.value || write.uncertain.value) return
  editing.value = undefined
}

// Credential rotation: the secret appears once. Losing it means rotating again.
const rotating = shallowRef<Application>()
const rotation = useMutation()
const secret = shallowRef<Credential>()
async function rotate() {
  const app = rotating.value
  if (!app) return
  const result = await rotation.run(`credential:${app.id}:${app.credential_revision}`, app.credential_revision, (revision, key) => api.rotate(app.id, revision, key))
  if (result) rotated(app, result)
}
async function retryRotation() {
  const app = rotating.value
  const result = await rotation.retry()
  if (app && result) rotated(app, result as Credential)
}
function rotated(app: Application, credential: Credential) {
  rotating.value = undefined
  replace({ ...app, credential_revision: credential.revision })
  // A replayed request no longer carries the secret; the developer must rotate again to see one.
  if (credential.retrievable && credential.client_secret) secret.value = credential
  else toast(t('platform.developer.secretNotRetrievable'))
}

// Withdrawal notices tell the application to stop using data. The developer records
// what the application did; that statement is kept separately from the read time.
const noticesFor = shallowRef<Application>()
const notices = usePaged<Notice>((after, signal) => api.notices(noticesFor.value!.id, after, signal))
function openNotices(app: Application) {
  noticesFor.value = app
  void notices.reload()
}
const answering = shallowRef<Notice>()
const answer = reactive({ status: 'deleted' as NonNullable<Notice['acknowledgement']>, note: '' })
const ack = useMutation()
const noteRequired = computed(() => answer.status === 'retention_exception')
function startAnswer(notice: Notice) {
  answering.value = notice
  answer.status = 'deleted'
  answer.note = ''
}
async function sendAnswer() {
  const app = noticesFor.value
  const notice = answering.value
  if (!app || !notice || (noteRequired.value && !answer.note.trim())) return
  const result = await ack.run(`ack:${notice.id}`, { status: answer.status, note: answer.note.trim() }, (body, key) => api.acknowledge(app.id, notice.id, body, key))
  if (result) answered(result)
}
async function retryAnswer() {
  const result = await ack.retry()
  if (result) answered(result as Notice)
}
function answered(notice: Notice) {
  notices.items.value = notices.items.value.map((item) => (item.id === notice.id ? notice : item))
  answering.value = undefined
  toast(t('platform.developer.notices.recorded'))
}
</script>

<template>
  <MeLayout
    :title="t('platform.developer.title')"
    :description="t('platform.developer.description')"
  >
    <template #actions>
      <button
        class="btn btn-sm btn-primary"
        type="button"
        @click="edit()"
      >
        <Plus aria-hidden="true" />{{ t('platform.developer.create') }}
      </button>
    </template>
    <PagedState
      :status="apps.status.value"
      :error="apps.error.value"
      :count="apps.items.value.length"
      :next="apps.next.value"
      :appending="apps.appending.value"
      :empty-text="t('platform.developer.empty')"
      @retry="apps.reload"
      @more="apps.loadMore"
    >
      <ul class="list">
        <li
          v-for="app in apps.items.value"
          :key="app.id"
          class="card stack"
        >
          <div class="row-between">
            <h2 class="d-title">
              {{ app.name }}
            </h2>
            <StatusTag :tone="stateTone(app.state)">
              {{ t(`platform.developer.state.${app.state}`) }}
            </StatusTag>
          </div>
          <p
            v-if="app.note"
            class="notice small"
            :class="app.state === 'changes_requested' ? 'notice-warning' : 'notice-info'"
          >
            {{ t('platform.developer.note', { note: app.note }) }}
          </p>
          <dl class="facts">
            <div>
              <dt>{{ t('platform.developer.clientId') }}</dt>
              <dd class="row">
                <code>{{ app.id }}</code>
                <button
                  class="btn btn-icon copy"
                  type="button"
                  :aria-label="t('platform.developer.copyClientId', { name: app.name })"
                  @click="copy(app.id, t('platform.developer.clientIdCopied'))"
                >
                  <Copy aria-hidden="true" />
                </button>
              </dd>
            </div>
            <div>
              <dt>{{ t('platform.developer.clientType') }}</dt>
              <dd>{{ t(`platform.developer.clientTypes.${app.client_type}.title`) }}</dd>
            </div>
            <div>
              <dt>{{ t('platform.developer.redirects') }}</dt>
              <dd class="small break">
                <span
                  v-for="uri in app.redirect_uris"
                  :key="uri"
                  class="block"
                >{{ uri }}</span>
              </dd>
            </div>
            <div v-if="app.state === 'active'">
              <dt>{{ t('platform.developer.policy') }}</dt>
              <dd class="small">
                {{ t('platform.developer.policyValue', { grant: format.number(Math.round(app.policy.grant_seconds / 86400)), token: format.number(Math.round(app.policy.token_seconds / 60)), quota: format.number(app.policy.daily_quota) }) }}
              </dd>
            </div>
          </dl>
          <div class="stack-sm">
            <span class="field-label">{{ t('platform.developer.scopes') }}</span>
            <ul class="row">
              <li
                v-for="scope in app.requested_scopes"
                :key="scope"
                class="tag"
                :class="{ 'tag-success': app.approved_scopes.includes(scope) }"
              >
                {{ t(`platform.scopes.${scope}.title`) }} · {{ t(app.approved_scopes.includes(scope) ? 'platform.developer.approved' : 'platform.developer.notApproved') }}
              </li>
            </ul>
          </div>
          <div class="row">
            <button
              v-if="app.state !== 'active'"
              class="btn btn-sm"
              type="button"
              @click="edit(app)"
            >
              {{ t('platform.developer.resubmit') }}
            </button>
            <button
              v-if="app.client_type === 'confidential'"
              class="btn btn-sm"
              type="button"
              @click="rotating = app"
            >
              {{ t(app.credential_revision ? 'platform.developer.rotate' : 'platform.developer.issue') }}
            </button>
            <button
              class="btn btn-sm btn-ghost"
              type="button"
              @click="openNotices(app)"
            >
              {{ t('platform.developer.notices.open') }}
            </button>
          </div>
        </li>
      </ul>
    </PagedState>

    <SheetDialog
      :open="!!editing"
      :title="t(editing === 'new' ? 'platform.developer.create' : 'platform.developer.resubmit')"
      :description="t('platform.developer.formHint')"
      wide
      @close="closeEditor"
    >
      <form
        class="stack"
        novalidate
        @submit.prevent="save"
      >
        <fieldset
          class="stack"
          :disabled="write.busy.value || write.uncertain.value"
        >
          <div class="field">
            <label
              class="field-label"
              for="app-name"
            >{{ t('platform.developer.name') }}</label>
            <input
              id="app-name"
              v-model="form.name"
              class="input"
              maxlength="80"
              autocomplete="off"
            >
          </div>
          <div class="field">
            <label
              class="field-label"
              for="app-purpose"
            >{{ t('platform.developer.purpose') }}</label>
            <textarea
              id="app-purpose"
              v-model="form.purpose"
              class="textarea"
              maxlength="1000"
              aria-describedby="app-purpose-hint"
            />
            <span
              id="app-purpose-hint"
              class="field-hint"
            >{{ t('platform.developer.purposeHint') }}</span>
          </div>
          <div class="field">
            <label
              class="field-label"
              for="app-redirects"
            >{{ t('platform.developer.redirects') }}</label>
            <textarea
              id="app-redirects"
              v-model="form.redirects"
              class="textarea mono"
              rows="3"
              inputmode="url"
              :aria-invalid="!!redirectError"
              aria-describedby="app-redirects-hint"
            />
            <span
              id="app-redirects-hint"
              :class="redirectError ? 'field-error' : 'field-hint'"
            >{{ redirectError || t('platform.developer.redirectsHint') }}</span>
          </div>
          <fieldset class="stack-sm">
            <legend class="field-label">
              {{ t('platform.developer.clientType') }}
            </legend>
            <label
              v-for="type in (['confidential', 'public'] as const)"
              :key="type"
              class="check"
            >
              <input
                v-model="form.clientType"
                type="radio"
                :value="type"
              >
              <span class="stack-xs">
                <span>{{ t(`platform.developer.clientTypes.${type}.title`) }}</span>
                <span class="subtle">{{ t(`platform.developer.clientTypes.${type}.detail`) }}</span>
              </span>
            </label>
          </fieldset>
          <fieldset class="stack-sm">
            <legend class="field-label">
              {{ t('platform.developer.scopes') }}
            </legend>
            <label
              v-for="scope in scopes"
              :key="scope"
              class="check"
            >
              <input
                v-model="form.scopes"
                type="checkbox"
                :value="scope"
              >
              <span class="stack-xs">
                <span>{{ t(`platform.scopes.${scope}.title`) }}</span>
                <span class="subtle">{{ t(`platform.scopes.${scope}.detail`) }}</span>
              </span>
            </label>
          </fieldset>
        </fieldset>
        <MutationNotice
          :busy="write.busy.value"
          :error="write.error.value"
          :uncertain="write.uncertain.value"
          @retry="retrySave"
        />
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="submit"
            :disabled="!formValid || write.busy.value || write.uncertain.value"
          >
            {{ t('platform.developer.submit') }}
          </button>
          <button
            class="btn"
            type="button"
            :disabled="write.busy.value || write.uncertain.value"
            @click="closeEditor"
          >
            {{ t('common.cancel') }}
          </button>
        </div>
      </form>
    </SheetDialog>

    <ConfirmDialog
      :open="!!rotating"
      :title="t(rotating?.credential_revision ? 'platform.developer.rotate' : 'platform.developer.issue')"
      :message="rotation.uncertain.value ? t('common.uncertain') : rotation.error.value ? errorText(rotation.error.value) : t(rotating?.credential_revision ? 'platform.developer.rotateConfirm' : 'platform.developer.issueConfirm')"
      :confirm-label="rotation.uncertain.value ? t('common.retryOriginal') : t(rotating?.credential_revision ? 'platform.developer.rotate' : 'platform.developer.issue')"
      :busy="rotation.busy.value"
      @confirm="rotation.uncertain.value ? retryRotation() : rotate()"
      @cancel="!rotation.busy.value && !rotation.uncertain.value && (rotating = undefined)"
    />
    <SheetDialog
      :open="!!secret"
      :title="t('platform.developer.secretTitle')"
      :description="t('platform.developer.secretHint')"
      @close="secret = undefined"
    >
      <div
        v-if="secret"
        class="stack"
      >
        <code class="secret">{{ secret.client_secret }}</code>
        <div class="form-actions">
          <button
            class="btn btn-primary"
            type="button"
            @click="copy(secret.client_secret ?? '', t('platform.developer.secretCopied'))"
          >
            <Copy aria-hidden="true" />{{ t('platform.developer.copySecret') }}
          </button>
          <button
            class="btn"
            type="button"
            @click="secret = undefined"
          >
            {{ t('platform.developer.secretSaved') }}
          </button>
        </div>
      </div>
    </SheetDialog>

    <SheetDialog
      :open="!!noticesFor"
      :title="t('platform.developer.notices.title', { name: noticesFor?.name ?? '' })"
      :description="t('platform.developer.notices.hint')"
      wide
      @close="!ack.busy.value && !ack.uncertain.value && (noticesFor = undefined, answering = undefined)"
    >
      <PagedState
        :status="notices.status.value"
        :error="notices.error.value"
        :count="notices.items.value.length"
        :next="notices.next.value"
        :appending="notices.appending.value"
        :empty-text="t('platform.developer.notices.empty')"
        @retry="notices.reload"
        @more="notices.loadMore"
      >
        <ul class="list">
          <li
            v-for="notice in notices.items.value"
            :key="notice.id"
            class="card stack-sm"
          >
            <div class="row-between">
              <b>{{ t(`platform.developer.notices.reason.${notice.reason}`) }}</b>
              <StatusTag :tone="notice.acknowledgement ? 'success' : 'warning'">
                {{ notice.acknowledgement ? t(`platform.developer.notices.status.${notice.acknowledgement}`) : t('platform.developer.notices.unanswered') }}
              </StatusTag>
            </div>
            <p class="subtle">
              {{ t('platform.developer.notices.meta', { user: notice.subject, time: format.dateTime(notice.created_at) }) }}
            </p>
            <ul class="row">
              <li
                v-for="scope in notice.scopes"
                :key="scope"
                class="tag"
              >
                {{ t(`platform.scopes.${scope}.title`) }}
              </li>
            </ul>
            <p
              v-if="notice.note"
              class="small muted"
            >
              {{ t('platform.developer.note', { note: notice.note }) }}
            </p>
            <button
              v-if="!notice.acknowledgement && answering?.id !== notice.id"
              class="btn btn-sm"
              type="button"
              @click="startAnswer(notice)"
            >
              {{ t('platform.developer.notices.answer') }}
            </button>
            <form
              v-if="answering?.id === notice.id"
              class="stack-sm"
              novalidate
              @submit.prevent="sendAnswer"
            >
              <fieldset
                class="stack-sm"
                :disabled="ack.busy.value || ack.uncertain.value"
              >
                <legend class="field-label">
                  {{ t('platform.developer.notices.result') }}
                </legend>
                <label
                  v-for="status in (['received', 'deleted', 'retention_exception'] as const)"
                  :key="status"
                  class="check"
                >
                  <input
                    v-model="answer.status"
                    type="radio"
                    :value="status"
                  >
                  <span>{{ t(`platform.developer.notices.status.${status}`) }}</span>
                </label>
                <label class="field">
                  <span class="field-label">{{ t(noteRequired ? 'platform.developer.notices.retentionReason' : 'platform.developer.notices.noteOptional') }}</span>
                  <textarea
                    v-model="answer.note"
                    class="textarea"
                    rows="2"
                    maxlength="1000"
                  />
                </label>
              </fieldset>
              <MutationNotice
                :busy="ack.busy.value"
                :error="ack.error.value"
                :uncertain="ack.uncertain.value"
                @retry="retryAnswer"
              />
              <div class="row">
                <button
                  class="btn btn-sm btn-primary"
                  type="submit"
                  :disabled="(noteRequired && !answer.note.trim()) || ack.busy.value || ack.uncertain.value"
                >
                  {{ t('platform.developer.notices.send') }}
                </button>
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="ack.busy.value || ack.uncertain.value"
                  @click="answering = undefined"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </form>
          </li>
        </ul>
      </PagedState>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
code { font-family: var(--mono); font-size: .875rem; overflow-wrap: anywhere; }
.copy { width: 28px; min-height: 28px; background: transparent; color: var(--label-3); }
.copy svg { width: 14px; height: 14px; }
.break { overflow-wrap: anywhere; }
.block { display: block; }
.mono { font-family: var(--mono); font-size: .875rem; }
.check { display: flex; align-items: flex-start; gap: .5rem; }
.check input { margin-block-start: .25rem; }
.stack-xs { display: grid; gap: .125rem; }
.secret { display: block; padding: .75rem 1rem; border-radius: var(--radius); background: var(--fill); user-select: all; }
</style>
