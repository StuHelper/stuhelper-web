<script setup lang="ts">
import { Bell, CheckCheck, MessageCircle, ShieldCheck, UserRound } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { isolate } from '../../shared/format'
import { errorCode } from '../../shared/api/errors'
import { useAsync, usePaged } from '../../shared/composables/async'
import PagedState from '../../shared/ui/PagedState.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import { useLinkAvailable } from '../../shared/capabilities'
import MeLayout from '../account/MeLayout.vue'
import { targetRoute, titleMessage, useNotificationsApi, type Notification } from './api'

// In-site notifications about the person's own content, reports, requests and
// verification. Opening one marks it read and goes to its page when the target
// is still accessible; otherwise the notification explains why it cannot open.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const router = useRouter()
const linkAvailable = useLinkAvailable()
const targetAvailable = (item: Notification) => {
  const to = targetRoute(item.target)
  return !!to && linkAvailable(to)
}
const api = useNotificationsApi()
const list = usePaged<Notification>((cursor, signal) => api.list(cursor, signal))
void list.reload()
const unread = useAsync((signal) => api.unread(signal))
void unread.reload()
const preferences = useAsync((signal) => api.preferences(signal))
void preferences.reload()

const icons = { interaction: MessageCircle, business: Bell, security: ShieldCheck, account: UserRound } as const
const busy = ref(false)

function title(item: Notification) {
  // Identifiers are left-to-right; isolating them keeps right-to-left sentences in order.
  return t(titleMessage(item.title_key), Object.fromEntries(Object.entries(item.title_params).map(([key, value]) => [key, isolate(value)])))
}
function stamp(at: string) {
  return format.value.dateTime(at)
}
async function open(item: Notification) {
  if (!item.read_at) {
    // Marking read is idempotent; a failure keeps the item unread and is retried on the next open.
    try {
      await api.read(item.id)
      list.items.value = list.items.value.map((entry) => (entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry))
      if (typeof unread.data.value === 'number') unread.data.value = Math.max(0, unread.data.value - 1)
    } catch (failure) {
      toast(errorText(errorCode(failure)))
    }
  }
  const route = targetRoute(item.target)
  if (item.target_status === 'accessible' && route && linkAvailable(route)) void router.push(route)
}
async function readAll() {
  if (busy.value) return
  busy.value = true
  try {
    await api.readAll()
    const now = new Date().toISOString()
    list.items.value = list.items.value.map((entry) => (entry.read_at ? entry : { ...entry, read_at: now }))
    unread.data.value = 0
    toast(t('notifications.allRead'))
  } catch (failure) {
    toast(errorText(errorCode(failure)))
  } finally {
    busy.value = false
  }
}
async function toggleInteraction(enabled: boolean) {
  if (busy.value) return
  busy.value = true
  try {
    preferences.data.value = await api.savePreferences({ interaction_enabled: enabled })
    toast(t(enabled ? 'notifications.interactionOn' : 'notifications.interactionOff'))
  } catch (failure) {
    toast(errorText(errorCode(failure)))
  } finally {
    busy.value = false
  }
}
const description = computed(() => (typeof unread.data.value === 'number' && unread.data.value > 0 ? t('notifications.unread', { count: format.value.number(unread.data.value) }) : t('notifications.description')))
</script>

<template>
  <MeLayout
    :title="t('notifications.title')"
    :description="description"
  >
    <div class="row-between">
      <label
        v-if="preferences.data.value"
        class="check"
      >
        <input
          type="checkbox"
          :checked="preferences.data.value.interaction_enabled"
          :disabled="busy"
          @change="toggleInteraction(($event.target as HTMLInputElement).checked)"
        >
        <span>{{ t('notifications.interaction') }}</span>
      </label>
      <span v-else />
      <button
        class="btn btn-sm"
        type="button"
        :disabled="busy || !unread.data.value"
        @click="readAll"
      >
        <CheckCheck aria-hidden="true" />{{ t('notifications.readAll') }}
      </button>
    </div>
    <p class="subtle small">
      {{ t('notifications.always') }}
    </p>
    <PagedState
      :status="list.status.value"
      :error="list.error.value"
      :count="list.items.value.length"
      :next="list.next.value"
      :appending="list.appending.value"
      :empty-text="t('notifications.empty')"
      @retry="list.reload"
      @more="list.loadMore"
    >
      <ul class="group">
        <li
          v-for="item in list.items.value"
          :key="item.id"
        >
          <button
            class="group-row has-icon note"
            :class="{ unread: !item.read_at }"
            type="button"
            @click="open(item)"
          >
            <span class="icon-tile"><component
              :is="icons[item.type]"
              aria-hidden="true"
            /></span>
            <span class="group-body">
              <span class="group-title">{{ title(item) }}</span>
              <span
                v-if="item.count > 1"
                class="group-detail"
              >{{ t('notifications.count', { count: format.number(item.count) }) }}</span>
              <span
                v-if="item.target_status !== 'accessible' || !targetAvailable(item)"
                class="group-detail"
              >{{ t(`notifications.status.${targetAvailable(item) ? item.target_status : 'unavailable'}`) }}</span>
              <span class="subtle">{{ stamp(item.created_at) }}</span>
            </span>
            <span
              v-if="!item.read_at"
              class="dot"
            ><span class="visually-hidden">{{ t('notifications.unreadMark') }}</span></span>
          </button>
        </li>
      </ul>
    </PagedState>
  </MeLayout>
</template>

<style scoped>
.note { align-items: flex-start; inline-size: 100%; text-align: start; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; }
.note .group-title { font-weight: 500; }
.note.unread .group-title { font-weight: 650; }
.dot { flex: none; align-self: center; width: 9px; height: 9px; border-radius: 50%; background: var(--accent-fill); }
.check { display: flex; align-items: center; gap: .5rem; }
</style>
