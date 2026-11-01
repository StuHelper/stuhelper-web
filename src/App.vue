<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import { localeReady } from './app/i18n'
import AppLayout from './app/layout/AppLayout.vue'
import ConfirmHost from './shared/ui/ConfirmHost.vue'
import { extras } from './shared/extras'
import AccessPanel from './features/account/AccessPanel.vue'
import { useAccess } from './features/account/access'

const route = useRoute()
const { locale } = useI18n()
const access = useAccess()
// Content pages are not mounted until access is confirmed, so they send no
// business request before that. The server still authorizes every request.
const blocked = computed(() => route.meta.access === 'verified' && access.state.value !== 'verified')
</script>

<template>
  <AppLayout v-if="localeReady">
    <AccessPanel
      v-if="blocked"
      gate
    />
    <RouterView
      v-else
      :key="extras.remountOnLocale ? locale : undefined"
    />
  </AppLayout>
  <ConfirmHost />
</template>
