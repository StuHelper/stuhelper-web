<script setup lang="ts">
import '../verification.css'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CameraCapture from '../components/CameraCapture.vue'
const { t } = useI18n()
const ticket = location.hash.slice(1)
history.replaceState(null, '', location.pathname + location.search)
const valid = /^[A-Za-z0-9_-]{43}$/.test(ticket)
const complete = ref(false)
</script>
<template>
  <section class="verification-page">
    <h1>{{ t('verification.phoneCapture') }}</h1>
    <p
      v-if="!valid"
      role="alert"
    >
      {{ t('verification.errors.expired') }}
    </p>
    <p
      v-else-if="complete"
      role="status"
    >
      {{ t('verification.phoneDone') }}
    </p>
    <CameraCapture
      v-else
      :ticket="ticket"
      @captured="complete = true"
    />
  </section>
</template>
