<script setup lang="ts">
import { Bot, Copy, Link2, MessageSquare } from 'lucide-vue-next'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import { useNow } from '../../shared/composables/clock'
import { isolate } from '../../shared/format'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../../shared/ui/toast'
import { maskQq, useQqBindingApi, type BotPart, type QqCode, type QqPart, type QqStatus } from './api'

// The three QQ binding parts. Each is verified on its own, and binding is complete only
// when all three are bound. The server reports completion; the page never derives it.
const { t } = useI18n()
const api = useQqBindingApi()
const now = useNow(1000)
const status = useAsync((signal) => api.status(signal))
void status.reload()

const parts = [
  { kind: 'onebot', icon: MessageSquare, tile: 'var(--c-cyan)' },
  { kind: 'official', icon: Bot, tile: 'var(--c-blue)' },
  { kind: 'connect', icon: Link2, tile: 'var(--c-indigo)' },
] as const
const bound = (value: QqStatus, kind: QqPart) => value[kind].bound
const count = computed(() => (status.data.value ? parts.filter((part) => bound(status.data.value!, part.kind)).length : 0))

/** Error codes from the QQ binding module, mapped to messages with a generic fallback. */
function message(failure: unknown) {
  const code = errorCode(failure).replace(/^qq_binding_/, '')
  const key = `qq.errors.${code}`
  return t(['already_bound', 'ownership_conflict', 'rate_limited', 'unavailable', 'account_closed', 'revision_conflict'].includes(code) ? key : 'qq.errors.unavailable')
}

// Bot verification: show a one-time code and wait for the bot to report it.
const sheet = ref<BotPart>()
const code = ref<QqCode>()
const codeError = ref('')
const loadingCode = ref(false)
let poll: ReturnType<typeof setInterval> | undefined
const remaining = computed(() => (code.value ? Math.max(0, Math.ceil((Date.parse(code.value.expires_at) - now.value) / 1000)) : 0))
async function openCode(kind: BotPart) {
  sheet.value = kind
  await newCode()
}
async function newCode() {
  if (!sheet.value || loadingCode.value) return
  loadingCode.value = true
  codeError.value = ''
  code.value = undefined
  try {
    // Each request uses a new key, which makes the previous unused code of this part invalid.
    code.value = await api.code(sheet.value, crypto.randomUUID())
    startPolling()
  } catch (failure) {
    codeError.value = message(failure)
  } finally {
    loadingCode.value = false
  }
}
function startPolling() {
  clearInterval(poll)
  poll = setInterval(async () => {
    const kind = sheet.value
    if (!kind || remaining.value === 0) return stopPolling()
    try {
      const current = await api.status()
      status.data.value = current
      if (bound(current, kind)) {
        closeSheet()
        toast(t(current.complete ? 'qq.completeToast' : 'qq.partBound', { part: t(`qq.parts.${kind}.title`) }))
      }
    } catch {
      // A failed check is retried on the next tick; the code stays valid until it expires.
    }
  }, 3000)
}
function stopPolling() {
  clearInterval(poll)
  poll = undefined
}
function closeSheet() {
  stopPolling()
  sheet.value = undefined
  code.value = undefined
}
onScopeDispose(stopPolling)
watch(remaining, (value) => { if (value === 0) stopPolling() })
async function copy() {
  if (!code.value) return
  try {
    await navigator.clipboard.writeText(code.value.code)
    toast(t('qq.copied'))
  } catch {
    toast(t('qq.copyFailed'))
  }
}

// QQ Connect leaves the site for the QQ authorization page and returns to /me/qq/callback.
const leaving = ref(false)
async function connect() {
  leaving.value = true
  try {
    const authorization = await api.startConnect(crypto.randomUUID())
    window.location.assign(authorization.url)
  } catch (failure) {
    leaving.value = false
    toast(message(failure))
  }
}

const unlinking = ref<QqPart>()
const busy = ref(false)
async function unlink() {
  const kind = unlinking.value
  const value = status.data.value
  if (!kind || !value || busy.value) return
  busy.value = true
  try {
    status.data.value = await api.unlink(kind, value[kind].revision, crypto.randomUUID())
    unlinking.value = undefined
    toast(t('qq.unlinked', { part: t(`qq.parts.${kind}.title`) }))
  } catch (failure) {
    toast(message(failure))
    void status.reload()
  } finally {
    busy.value = false
  }
}
function detail(value: QqStatus, kind: QqPart) {
  if (!bound(value, kind)) return t(`qq.parts.${kind}.hint`)
  return kind === 'onebot' && value.qq_number ? t('qq.parts.onebot.number', { number: isolate(maskQq(value.qq_number)) }) : t('qq.bound')
}
</script>

<template>
  <section
    class="section"
    aria-labelledby="qq-title"
  >
    <div class="row-between">
      <h2
        id="qq-title"
        class="d-title"
      >
        {{ t('qq.title') }}
      </h2>
      <span
        v-if="status.data.value"
        class="tag"
        :class="status.data.value.complete ? 'tag-success' : ''"
      >{{ status.data.value.complete ? t('qq.complete') : t('qq.progress', { done: count, total: parts.length }) }}</span>
    </div>
    <p
      v-if="status.data.value && !status.data.value.complete"
      class="muted small"
    >
      {{ t('qq.requirement') }}
    </p>
    <ErrorNotice
      v-if="status.status.value === 'error'"
      :code="status.error.value"
      @retry="status.reload()"
    />
    <ul
      v-else
      class="group"
      :aria-busy="status.status.value === 'loading'"
    >
      <li
        v-for="part in parts"
        :key="part.kind"
        class="group-row has-icon"
      >
        <span
          class="icon-tile"
          :style="{ '--tile': part.tile }"
        ><component
          :is="part.icon"
          aria-hidden="true"
        /></span>
        <span class="group-body">
          <span class="group-title">{{ t(`qq.parts.${part.kind}.title`) }}</span>
          <span
            v-if="!status.data.value"
            class="skeleton-tag"
            aria-hidden="true"
          />
          <span
            v-else
            class="group-detail"
          >{{ detail(status.data.value, part.kind) }}</span>
        </span>
        <template v-if="status.data.value">
          <button
            v-if="bound(status.data.value, part.kind)"
            class="btn btn-sm"
            type="button"
            :aria-label="t('qq.unlinkPart', { part: t(`qq.parts.${part.kind}.title`) })"
            @click="unlinking = part.kind"
          >
            {{ t('qq.unlink') }}
          </button>
          <button
            v-else-if="part.kind === 'connect'"
            class="btn btn-sm btn-primary"
            type="button"
            :disabled="leaving"
            :aria-label="t('qq.bindPart', { part: t('qq.parts.connect.title') })"
            @click="connect"
          >
            {{ t('qq.authorize') }}
          </button>
          <button
            v-else
            class="btn btn-sm btn-primary"
            type="button"
            :aria-label="t('qq.bindPart', { part: t(`qq.parts.${part.kind}.title`) })"
            @click="openCode(part.kind)"
          >
            {{ t('qq.bind') }}
          </button>
        </template>
      </li>
    </ul>

    <SheetDialog
      :open="!!sheet"
      :title="sheet ? t('qq.bindPart', { part: t(`qq.parts.${sheet}.title`) }) : ''"
      :description="sheet ? t(`qq.parts.${sheet}.steps`) : ''"
      @close="closeSheet"
    >
      <p
        v-if="codeError"
        class="field-error"
        role="alert"
      >
        {{ codeError }}
      </p>
      <template v-else-if="code">
        <p
          class="code"
          :aria-label="t('qq.codeLabel')"
        >
          {{ code.code }}
        </p>
        <p
          class="subtle center"
          aria-live="polite"
        >
          {{ remaining ? t('qq.expiresIn', { minutes: Math.floor(remaining / 60), seconds: String(remaining % 60).padStart(2, '0') }) : t('qq.expired') }}
        </p>
        <p class="notice notice-warning small">
          {{ t('qq.ownCodeOnly') }}
        </p>
        <p
          v-if="remaining"
          class="muted small center"
          role="status"
        >
          {{ t('qq.waiting') }}
        </p>
      </template>
      <p
        v-else
        class="muted center"
        role="status"
      >
        {{ t('common.loading') }}
      </p>
      <div class="form-actions">
        <button
          v-if="code && remaining"
          class="btn btn-primary"
          type="button"
          @click="copy"
        >
          <Copy aria-hidden="true" />{{ t('qq.copy') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="loadingCode"
          @click="newCode"
        >
          {{ t('qq.newCode') }}
        </button>
      </div>
    </SheetDialog>
    <ConfirmDialog
      :open="!!unlinking"
      :title="unlinking ? t('qq.unlinkPart', { part: t(`qq.parts.${unlinking}.title`) }) : ''"
      :message="t('qq.unlinkWarning')"
      :confirm-label="t('qq.unlink')"
      :busy="busy"
      danger
      @confirm="unlink"
      @cancel="unlinking = undefined"
    />
  </section>
</template>

<style scoped>
.code { padding: 1rem; border-radius: var(--radius); background: var(--fill); font-family: var(--mono); font-size: 1.375rem; font-weight: 600; letter-spacing: .08em; text-align: center; overflow-wrap: anywhere; user-select: all; }
.center { text-align: center; }
</style>
