<script setup lang="ts">
import { RouterView } from 'vue-router'
import { localeReady } from './app/i18n'
import AppLayout from './app/layout/AppLayout.vue'
</script>

<template>
  <AppLayout v-if="localeReady">
    <RouterView />
  </AppLayout>
</template>
