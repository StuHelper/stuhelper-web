<script setup lang="ts">
import { computed, type VNode } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { localeReady } from './app/i18n'
import AppLayout from './app/layout/AppLayout.vue'
import AccessPanel from './features/account/AccessPanel.vue'
import { useAccess } from './features/account/access'

const route = useRoute()
const access = useAccess()
// Content pages are not mounted until access is confirmed, so they send no
// business request before that. The server still authorizes every request.
const blocked = computed(() => route.meta.access === 'verified' && access.state.value !== 'verified')

// Animate between different pages only. A route change that keeps the same view,
// such as a new resource gaining its id, must not remount it and lose its state.
function pageKey(page: VNode) {
  return typeof page.type === 'object' && '__name' in page.type ? String(page.type.__name) : 'page'
}
</script>

<template>
  <AppLayout v-if="localeReady">
    <AccessPanel
      v-if="blocked"
      gate
    />
    <RouterView
      v-else
      v-slot="{ Component }"
    >
      <Transition
        name="page"
        mode="out-in"
      >
        <div
          v-if="Component"
          :key="pageKey(Component)"
        >
          <component :is="Component" />
        </div>
      </Transition>
    </RouterView>
  </AppLayout>
</template>
