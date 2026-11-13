<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSession } from '../session'

const { t } = useI18n()
const session = useSession()
</script>

<template>
  <span
    v-if="session.unavailable.value && session.session.value"
    role="status"
  >
    {{ t('account.unavailable') }}
    <button
      type="button"
      @click="session.reload"
    >{{ t('common.retry') }}</button>
  </span>
</template>
