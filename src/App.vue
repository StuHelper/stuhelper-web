<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import { localeReady } from './app/i18n'
import AppLayout from './app/layout/AppLayout.vue'
import { hasLeaveWarning } from './shared/composables/leave'
import FavoriteMoveDialog from './features/favorites/FavoriteMoveDialog.vue'
import { moveTarget } from './features/favorites/state'
import ConfirmHost from './shared/ui/ConfirmHost.vue'
import { extras } from './shared/extras'
import AccessPanel from './features/account/AccessPanel.vue'
import NotFoundView from './features/home/NotFoundView.vue'
import { useCapabilities } from './shared/capabilities'
import { useAccess } from './features/account/access'
import { useSession } from './shared/session'

const route = useRoute()
const { locale } = useI18n()
const access = useAccess()
const session = useSession()
watch(() => session.session.value?.profile.id, () => { moveTarget.value = undefined })
// Content pages are not mounted until access is confirmed, so they send no
// business request before that. The server still authorizes every request.
// Prototype pages read some text once, so they remount to translate. Input at risk wins over fresh text.
const localeKey = ref(locale.value)
watch(locale, (value) => {
  if (!hasLeaveWarning()) localeKey.value = value
})
// A new resource becoming its saved edit page is one continuing form, so its chosen file survives.
const pathKey = ref(0)
watch(() => route.path, (_, from) => {
  if (route.meta.remountOnPath && route.meta.continuesFrom !== from) pathKey.value++
})
const pageKey = computed(() => [extras.remountOnLocale ? localeKey.value : '', pathKey.value].join('|'))
const capabilities = useCapabilities()
// An optional module that this deployment does not run shows as unavailable;
// the page waits until the module list is known so it sends no request first.
const capability = computed(() => route.meta.capability)
const waiting = computed(() => !!capability.value && (capabilities.status.value === 'idle' || capabilities.status.value === 'loading'))
const missing = computed(() => !!capability.value && !waiting.value && !capabilities.has(capability.value))
const blocked = computed(() => (route.meta.access === 'verified' && access.state.value !== 'verified') || (route.meta.access === 'member' && session.state.value !== 'member'))
</script>

<template>
  <ConfigProvider :dir="locale === 'ar-EG' ? 'rtl' : 'ltr'">
    <AppLayout v-if="localeReady">
      <NotFoundView v-if="missing" />
      <template v-else-if="waiting" />
      <AccessPanel
        v-else-if="blocked"
        gate
      />
      <RouterView
        v-else
        :key="pageKey"
      />
    </AppLayout>
    <FavoriteMoveDialog
      v-if="moveTarget && moveTarget.profileId === session.session.value?.profile.id"
      :key="moveTarget.item.id"
      :item="moveTarget.item"
      @close="moveTarget = undefined"
    />
    <ConfirmHost />
  </ConfigProvider>
</template>
