<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSession } from '../session'

const { t } = useI18n()
const session = useSession()
</script>

<template>
  <span
    v-if="session.unavailable.value && session.session.value"
    class="session-notice"
    role="status"
  >
    <span class="session-notice-text truncate">{{ t('account.unavailable') }}</span>
    <button
      class="btn btn-sm"
      type="button"
      @click="session.reload"
    >{{ t('common.retry') }}</button>
  </span>
</template>

<style scoped>
/* Sits in the navigation bar next to the avatar, so it stays one compact capsule. */
.session-notice { display: inline-flex; align-items: center; gap: .5rem; min-width: 0; padding-inline-start: .75rem; border-radius: var(--pill); background: var(--warning-soft); color: var(--warning); font-size: .8125rem; font-weight: 550; }
.session-notice .btn { min-height: 30px; padding-block: .125rem; background: color-mix(in srgb, currentcolor 14%, transparent); color: inherit; }
@media (max-width: 760px) { .session-notice-text { max-width: 7rem; } }
</style>
