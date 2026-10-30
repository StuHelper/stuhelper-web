<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CameraCapture from './CameraCapture.vue'

// Phone side of material capture. The single-use token arrives in the URL
// fragment and is removed from the address bar immediately.
const { t } = useI18n()
const ticket = location.hash.slice(1)
history.replaceState(history.state, '', location.pathname + location.search)
const valid = /^[A-Za-z0-9_-]{43}$/.test(ticket)
const complete = ref(false)
</script>

<template>
  <section class="capture stack">
    <h1>{{ t('verification.capture.title') }}</h1>
    <p
      v-if="!valid"
      class="notice notice-error"
      role="alert"
    >
      {{ t('errors.expired') }}
    </p>
    <p
      v-else-if="complete"
      class="notice notice-success"
      role="status"
    >
      {{ t('verification.capture.done') }}
    </p>
    <CameraCapture
      v-else
      :ticket="ticket"
      @captured="complete = true"
    />
  </section>
</template>

<style scoped>
.capture { max-width: 34rem; margin-inline: auto; }
</style>
