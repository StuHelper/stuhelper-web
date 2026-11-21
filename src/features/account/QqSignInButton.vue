<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSession } from '../../shared/session'

// Signs in through QQ for accounts that already linked QQ.
const { t } = useI18n()
const session = useSession()
</script>

<template>
  <button
    class="btn qq"
    type="button"
    @click="session.signInWithQq"
  >
    <svg
      class="qq-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <ellipse
        cx="12"
        cy="11"
        rx="6.5"
        ry="8"
        fill="#1a1a1a"
      />
      <ellipse
        cx="12"
        cy="13"
        rx="4.4"
        ry="5.6"
        fill="#fff"
      />
      <circle
        cx="9.8"
        cy="8"
        r="1.1"
        fill="#fff"
      />
      <circle
        cx="14.2"
        cy="8"
        r="1.1"
        fill="#fff"
      />
      <path
        d="M9.6 10.2h4.8l-2.4 1.6z"
        fill="#f5b300"
      />
      <path
        d="M6.8 14.2c2.9 1.5 7.5 1.5 10.4 0l-.4 1.8c-3 1.3-6.6 1.3-9.6 0z"
        fill="#e8352b"
      />
      <ellipse
        cx="9"
        cy="20"
        rx="2.4"
        ry="1"
        fill="#f5b300"
      />
      <ellipse
        cx="15"
        cy="20"
        rx="2.4"
        ry="1"
        fill="#f5b300"
      />
    </svg>
    <span>{{ t('account.signInWithQq') }}</span>
  </button>
</template>

<style scoped>
.qq { gap: .375rem; }
.qq-mark { width: 1.25rem; height: 1.25rem; flex: none; }
</style>
