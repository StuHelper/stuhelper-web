<script setup lang="ts">
import { ConfigProvider } from 'reka-ui'
import { computed, nextTick, ref, watch } from 'vue'
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
import { useAccess, useCampusId } from './features/account/access'
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
// List pages stay alive behind their detail pages: going back shows the same rows, filters,
// expanded sections and scroll position without reading them again. Only these components are
// cached, so forms holding passwords or unsent input are never kept in memory.
// A kept page is identified by its path alone; the path counter would remount it on return.
const localePart = computed(() => (extras.remountOnLocale ? localeKey.value : ''))
// Kept pages hold the viewer's own data (votes, recent courses, downloads). When the person,
// school or access level changes, every kept page is dropped. Emptying `include` prunes the cache
// without remounting the page on screen (a callback page must not run twice).
const campus = useCampusId()
const cacheScope = computed(() => [session.session.value?.profile.id ?? '', campus.value ?? '', access.state.value].join('|'))
const keptPages = ['DirectoryView', 'BrowseView', 'SearchView', 'PopularView']
const kept = ref(keptPages)
watch(cacheScope, async () => {
  kept.value = []
  await nextTick()
  kept.value = keptPages
})
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
      <NotFoundView
        v-if="missing"
        disabled
      />
      <template v-else-if="waiting" />
      <AccessPanel
        v-else-if="blocked"
        gate
      />
      <RouterView
        v-else
        v-slot="{ Component, route: current }"
      >
        <KeepAlive
          :include="kept"
          :max="4"
        >
          <component
            :is="Component"
            :key="current.meta.keepAlive ? `${localePart}|${current.path}` : pageKey"
          />
        </KeepAlive>
      </RouterView>
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
