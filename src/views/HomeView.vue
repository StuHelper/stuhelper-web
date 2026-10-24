<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ConnectionStatus from '../components/ConnectionStatus.vue'
import { usePlatform } from '../composables/usePlatform'

const { t } = useI18n()
const { state, error, reload } = usePlatform({ admin: false })
</script>

<template>
  <div class="home-view">
    <p class="eyebrow">
      {{ t('home.eyebrow') }}
    </p>
    <h1 class="page-title">
      {{ t('home.title') }}
    </h1>
    <p class="page-description">
      {{ t('home.description') }}
    </p>
    <ConnectionStatus
      class="service-status"
      :state="state"
      :error="error"
      :admin="false"
      @retry="reload"
    />
    <div class="preparation-note">
      <span
        class="note-index"
        aria-hidden="true"
      >01 /</span>
      <p>{{ t('home.note') }}</p>
    </div>
  </div>
</template>

<style scoped>
.home-view { max-width: 48rem; }
.eyebrow { font-size: .7rem; font-weight: 700; letter-spacing: .18em; color: var(--accent); margin: 0 0 1.5rem; }
.page-title { max-width: 14em; font-size: clamp(2rem, 4.5vw, 3.7rem); line-height: 1.28; letter-spacing: -.04em; font-weight: 650; margin: 0; text-wrap: balance; }
.page-description { max-width: 36rem; margin: 1.75rem 0 2.5rem; color: var(--muted); line-height: 1.9; font-size: 1.03rem; }
.service-status { max-width: 38rem; }
.preparation-note { margin-top: 4rem; display: flex; align-items: baseline; gap: 1rem; border-top: 1px solid var(--border); padding-top: 1.3rem; max-width: 38rem; }
.note-index { color: var(--accent); font-size: .75rem; font-family: ui-monospace, monospace; white-space: nowrap; }
.preparation-note p { margin: 0; font-size: .8rem; line-height: 1.8; color: var(--muted); }
</style>
