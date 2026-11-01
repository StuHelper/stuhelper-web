<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Bell } from 'lucide-vue-next'
import { RouterLink, useRoute } from 'vue-router'
import { useSession } from '../../shared/session'
import { unread } from '../store'
const { t: tr } = useI18n()
const session = useSession()
const route = useRoute()
</script>
<template>
  <RouterLink v-if="session.state.value === 'member'" class="btn btn-icon bell" to="/notifications" :aria-label="tr('demo.notificationsUnread', { p0: unread })" :aria-current="route.path === '/notifications' ? 'page' : undefined">
    <Bell aria-hidden="true" /><span v-if="unread" class="d-unread">{{ unread }}</span>
  </RouterLink>
</template>
<style scoped>
.bell { position: relative; background: transparent; color: var(--label-2); }
.bell:hover { background: var(--fill); }
.bell[aria-current="page"] { color: var(--accent); }
</style>
