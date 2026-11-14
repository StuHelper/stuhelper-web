<script setup lang="ts">
import { BadgeCheck, Bell, CheckCheck, ClipboardCheck, MessageCircleHeart, UsersRound } from 'lucide-vue-next'
import { computed, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { isolate } from '../../shared/format'
import { errorCode } from '../../shared/api/errors'
import { useAsync, usePaged } from '../../shared/composables/async'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import { useLinkAvailable } from '../../shared/capabilities'
import { extras } from '../../shared/extras'
import MeLayout from '../account/MeLayout.vue'
import { boxOf, boxes, targetRoute, titleMessage, useNotificationsApi, type Box, type Notification } from './api'

// The message center. Notifications are filed into boxes by what they are
// about: three boxes sit on top as entries, and the conversation list below
// holds threads. System notices are the first thread; the list is where
// further kinds of conversation appear without changing this layout.
// Opening a notification marks it read and goes to its page when the target is
// still accessible; otherwise the notification explains why it cannot open.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const route = useRoute()
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

const looks: Record<Box, { icon: Component; tile: string }> = {
  interaction: { icon: MessageCircleHeart, tile: 'var(--c-pink)' },
  review: { icon: ClipboardCheck, tile: 'var(--c-orange)' },
  verification: { icon: BadgeCheck, tile: 'var(--c-green)' },
  system: { icon: Bell, tile: 'var(--c-blue)' },
}
const entries = ['interaction', 'review', 'verification'] as const
const threadBoxes = ['system'] as const
const open = computed<Box | undefined>(() => boxes.find((box) => box === route.query.box))
const filed = computed(() => {
  const groups = Object.fromEntries(boxes.map((box) => [box, [] as Notification[]])) as Record<Box, Notification[]>
  for (const item of list.items.value) groups[boxOf(item)].push(item)
  return groups
})
const unreadIn = (box: Box) => filed.value[box].filter((item) => !item.read_at).length
const threads = computed(() => threadBoxes.filter((box) => filed.value[box].length).map((box) => ({ box, latest: filed.value[box][0]!, unread: unreadIn(box) })))
// Conversations with people and groups come after the notification threads, newest first.
const chats = computed(() => [...extras.threads].sort((a, b) => b.at.localeCompare(a.at)))
const shown = computed(() => (open.value ? filed.value[open.value] : []))
const busy = ref(false)

function title(item: Notification) {
  // Identifiers are left-to-right; isolating them keeps right-to-left sentences in order.
  return t(titleMessage(item.title_key), Object.fromEntries(Object.entries(item.title_params).map(([key, value]) => [key, isolate(value)])))
}
function stamp(at: string) {
  return format.value.dateTime(at)
}
async function openItem(item: Notification) {
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
  const to = targetRoute(item.target)
  if (item.target_status === 'accessible' && to && linkAvailable(to)) void router.push(to)
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
    :title="open ? t(`notifications.boxes.${open}`) : t('notifications.title')"
    :description="open ? '' : description"
    :back="open ? '/notifications' : undefined"
    :back-label="open ? t('notifications.title') : undefined"
  >
    <template #actions>
      <button
        class="btn btn-sm"
        type="button"
        :disabled="busy || !unread.data.value"
        @click="readAll"
      >
        <CheckCheck aria-hidden="true" />{{ t('notifications.readAll') }}
      </button>
    </template>

    <!-- One box: its notifications, newest first. -->
    <PagedState
      v-if="open"
      :status="list.status.value"
      :error="list.error.value"
      :count="shown.length"
      :next="list.next.value"
      :appending="list.appending.value"
      :empty-text="t('notifications.empty')"
      @retry="list.reload"
      @more="list.loadMore"
    >
      <ul class="group">
        <li
          v-for="item in shown"
          :key="item.id"
        >
          <button
            class="group-row has-icon note"
            :class="{ unread: !item.read_at }"
            type="button"
            @click="openItem(item)"
          >
            <span
              class="icon-tile"
              :style="{ '--tile': looks[open].tile }"
            ><component
              :is="looks[open].icon"
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

    <!-- The center: boxes on top, conversations below. -->
    <template v-else>
      <nav
        class="boxes"
        :aria-label="t('notifications.boxesLabel')"
      >
        <RouterLink
          v-for="box in entries"
          :key="box"
          class="box"
          :to="{ path: '/notifications', query: { box } }"
        >
          <span
            class="box-icon"
            :style="{ '--tile': looks[box].tile }"
          >
            <component
              :is="looks[box].icon"
              aria-hidden="true"
            />
            <span
              v-if="unreadIn(box)"
              class="badge"
            ><span aria-hidden="true">{{ format.number(unreadIn(box)) }}</span><span class="visually-hidden">{{ t('notifications.unreadCount', { count: format.number(unreadIn(box)) }) }}</span></span>
          </span>
          <span class="box-name">{{ t(`notifications.boxes.${box}`) }}</span>
        </RouterLink>
      </nav>

      <section
        class="section"
        aria-labelledby="threads-title"
      >
        <h2
          id="threads-title"
          class="threads-title"
        >
          {{ t('notifications.threads') }}
        </h2>
        <ErrorNotice
          v-if="list.status.value === 'error' && !list.items.value.length"
          :code="list.error.value"
          @retry="list.reload"
        />
        <ul
          v-else-if="threads.length || chats.length"
          class="group"
        >
          <li
            v-for="thread in threads"
            :key="thread.box"
          >
            <RouterLink
              class="group-row thread"
              :class="{ unread: thread.unread > 0 }"
              :to="{ path: '/notifications', query: { box: thread.box } }"
            >
              <span
                class="thread-avatar"
                :style="{ '--tile': looks[thread.box].tile }"
              >
                <component
                  :is="looks[thread.box].icon"
                  aria-hidden="true"
                />
              </span>
              <span class="thread-body">
                <span class="thread-head">
                  <span class="thread-name truncate">{{ t(`notifications.boxes.${thread.box}`) }}</span>
                  <span class="subtle thread-time">{{ stamp(thread.latest.created_at) }}</span>
                </span>
                <span class="thread-foot">
                  <span class="thread-preview truncate">{{ title(thread.latest) }}</span>
                  <span
                    v-if="thread.unread"
                    class="badge inline"
                  ><span aria-hidden="true">{{ format.number(thread.unread) }}</span><span class="visually-hidden">{{ t('notifications.unreadCount', { count: format.number(thread.unread) }) }}</span></span>
                </span>
              </span>
            </RouterLink>
          </li>
          <li
            v-for="chat in chats"
            :key="chat.id"
          >
            <RouterLink
              class="group-row thread"
              :class="{ unread: chat.unread > 0 }"
              :to="chat.to"
            >
              <span
                class="thread-avatar"
                :class="chat.kind"
              >
                <UsersRound
                  v-if="chat.kind === 'group'"
                  aria-hidden="true"
                />
                <span
                  v-else
                  aria-hidden="true"
                >{{ [...chat.name][0] }}</span>
              </span>
              <span class="thread-body">
                <span class="thread-head">
                  <span class="thread-name truncate">{{ chat.name }}</span>
                  <span class="subtle thread-time">{{ stamp(chat.at) }}</span>
                </span>
                <span class="thread-foot">
                  <span class="thread-preview truncate">{{ chat.preview }}</span>
                  <span
                    v-if="chat.unread"
                    class="badge inline"
                  ><span aria-hidden="true">{{ format.number(chat.unread) }}</span><span class="visually-hidden">{{ t('notifications.unreadCount', { count: format.number(chat.unread) }) }}</span></span>
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
        <p
          v-else-if="list.status.value !== 'loading' && list.status.value !== 'idle'"
          class="empty"
        >
          {{ list.items.value.length ? t('notifications.noThreads') : t('notifications.empty') }}
        </p>
        <div
          v-if="list.next.value"
          class="more"
        >
          <button
            class="btn btn-sm"
            type="button"
            :disabled="list.appending.value"
            @click="list.loadMore"
          >
            {{ list.appending.value ? t('common.loading') : t('common.loadMore') }}
          </button>
        </div>
      </section>

      <section class="card stack-sm">
        <label
          v-if="preferences.data.value"
          class="check switch"
        >
          <input
            type="checkbox"
            :checked="preferences.data.value.interaction_enabled"
            :disabled="busy"
            @change="toggleInteraction(($event.target as HTMLInputElement).checked)"
          >
          <span>{{ t('notifications.interaction') }}</span>
        </label>
        <p class="subtle small">
          {{ t('notifications.always') }}
        </p>
      </section>
    </template>
  </MeLayout>
</template>

<style scoped>
.note { align-items: flex-start; inline-size: 100%; text-align: start; background: none; border: 0; font: inherit; color: inherit; cursor: pointer; }
.note .group-title { font-weight: 500; }
.note.unread .group-title { font-weight: 650; }
.dot { flex: none; align-self: center; width: 9px; height: 9px; border-radius: 50%; background: var(--accent-fill); }

/* Boxes: three entries of equal width, each an icon with its unread count. */
.boxes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
.box { display: flex; flex-direction: column; align-items: center; gap: .625rem; padding: 1.125rem .5rem 1rem; border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-card); color: var(--label); text-align: center; transition: transform .45s var(--ease-out), box-shadow .45s var(--ease-out); }
.box:hover { color: var(--label); text-decoration: none; box-shadow: var(--shadow-lift); transform: translateY(-3px); }
.box:active { transform: scale(.97); transition-duration: .12s; }
.box-icon { position: relative; display: grid; place-items: center; width: 54px; height: 54px; border-radius: 18px; background: color-mix(in srgb, var(--tile) 14%, transparent); color: var(--tile); transition: transform .5s var(--spring); }
.box:hover .box-icon { transform: scale(1.08) rotate(-5deg); }
.box-icon svg { width: 26px; height: 26px; }
.box-name { max-width: 100%; font-size: .9375rem; font-weight: 550; line-height: 1.3; }
.badge { position: absolute; inset-block-start: -6px; inset-inline-end: -8px; display: grid; place-items: center; min-width: 20px; height: 20px; padding-inline: 5px; border-radius: var(--pill); background: var(--c-red); box-shadow: 0 0 0 2px var(--surface); color: #fff; font-size: .75rem; font-weight: 650; line-height: 1; font-variant-numeric: tabular-nums; }
.badge.inline { position: static; flex: none; box-shadow: none; }

/* Conversations: a round avatar, a name with its time, and one line of preview. */
.threads-title { font-size: 1.0625rem; font-weight: 620; }
.thread { align-items: center; gap: .875rem; min-height: 72px; }
.thread-avatar { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--tile); color: #fff; }
.thread-avatar svg { width: 23px; height: 23px; }
.thread-avatar.direct { background: linear-gradient(145deg, #8ea2ff, #5b6cf0); font-size: 1.125rem; font-weight: 650; }
.thread-avatar.group { background: linear-gradient(145deg, #57d6b0, #12a37f); }
.thread-body { display: grid; flex: 1; gap: .125rem; min-width: 0; }
.thread-head, .thread-foot { display: flex; align-items: center; justify-content: space-between; gap: .75rem; min-width: 0; }
.thread-name { font-weight: 550; }
.thread.unread .thread-name { font-weight: 680; }
.thread-time { flex: none; }
.thread-preview { color: var(--label-2); font-size: .9375rem; }
.more { display: flex; justify-content: center; }
</style>
