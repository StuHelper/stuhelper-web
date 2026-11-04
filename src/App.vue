<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import { localeReady } from './app/i18n'
import AppLayout from './app/layout/AppLayout.vue'
import { hasLeaveWarning } from './shared/composables/leave'
import ConfirmHost from './shared/ui/ConfirmHost.vue'
import { extras } from './shared/extras'
import AccessPanel from './features/account/AccessPanel.vue'
import { useAccess } from './features/account/access'
import { useSession } from './shared/session'

const route = useRoute()
const { locale } = useI18n()
const access = useAccess()
const session = useSession()
// Content pages are not mounted until access is confirmed, so they send no
// business request before that. The server still authorizes every request.
// Prototype pages read some text once, so they remount to translate. Input at risk wins over fresh text.
const localeKey = ref(locale.value)
watch(locale, (value) => {
  if (!hasLeaveWarning()) localeKey.value = value
})
// A new resource becoming its saved edit page is one continuing form, so its chosen file survives.
const pathKey = ref('')
watch(() => route.path, (to, from) => {
  if (route.meta.continuesFrom !== from) pathKey.value = route.meta.remountOnPath ? to : ''
})
const pageKey = computed(() => [extras.remountOnLocale ? localeKey.value : '', pathKey.value].join('|'))
const blocked = computed(() => (route.meta.access === 'verified' && access.state.value !== 'verified') || (route.meta.access === 'member' && session.state.value !== 'member'))
</script>

<template>
  <AppLayout v-if="localeReady">
    <AccessPanel
      v-if="blocked"
      gate
    />
    <RouterView
      v-else
      :key="pageKey"
    />
  </AppLayout>
  <ConfirmHost />
</template>
