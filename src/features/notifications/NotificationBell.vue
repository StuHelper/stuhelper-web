<script setup lang="ts">
import { Bell } from 'lucide-vue-next'
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { feature, useCapabilities } from '../../shared/capabilities'
import { useSession } from '../../shared/session'
import { useNotificationsApi } from './api'
import { refreshUnread, setUnread, unreadCount } from './unread'

// Entry to the message center from every page, with the unread count. It shows only for a
// signed-in session on a deployment that runs notifications. The count is read when the
// bell appears and again when the page becomes visible; the shared store limits how often.
const { t } = useI18n()
const format = useFormat()
const route = useRoute()
const session = useSession()
const capabilities = useCapabilities()
const api = useNotificationsApi()
const shown = computed(() => session.state.value === 'member' && capabilities.has(feature.notifications))
const count = computed(() => unreadCount.value ?? 0)
// The badge stays two digits wide; the exact number is in the accessible name.
const badge = computed(() => (count.value > 99 ? `${format.value.number(99)}+` : format.value.number(count.value)))
const refresh = () => { if (shown.value && document.visibilityState === 'visible') void refreshUnread(() => api.unread()) }

watch(shown, (value) => {
  if (value) refresh()
  // Another account must not inherit this one's number.
  else setUnread(undefined)
}, { immediate: true })
document.addEventListener('visibilitychange', refresh)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', refresh))
</script>

<template>
  <RouterLink
    v-if="shown"
    class="btn btn-icon bell"
    to="/notifications"
    :aria-label="count ? t('notifications.unread', { count: format.number(count) }) : t('notifications.link')"
    :aria-current="route.path === '/notifications' ? 'page' : undefined"
  >
    <Bell aria-hidden="true" />
    <span
      v-if="count"
      class="d-unread"
      aria-hidden="true"
    >{{ badge }}</span>
  </RouterLink>
</template>

<style scoped>
.bell { position: relative; background: transparent; color: var(--label-2); }
.bell:hover { background: var(--fill); color: var(--label); }
.bell[aria-current="page"] { color: var(--accent); }
.bell svg { width: 19px; height: 19px; }
</style>
