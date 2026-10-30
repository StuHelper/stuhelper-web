<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useSession } from '../../shared/session'

// Personal pages render only for a signed-in session. The server still checks
// every request; this only avoids showing an empty private page to guests.
const { t } = useI18n()
const session = useSession()
</script>

<template>
  <slot v-if="session.state.value === 'member'" />
  <div
    v-else-if="session.state.value === 'loading'"
    class="skeleton"
    aria-busy="true"
  >
    <span class="visually-hidden">{{ t('common.loading') }}</span>
    <span aria-hidden="true" />
    <span aria-hidden="true" />
  </div>
  <section
    v-else
    class="card sign-in stack"
  >
    <h2>{{ t(session.state.value === 'guest' ? 'account.signInRequired' : 'account.unavailable') }}</h2>
    <p class="muted">
      {{ t(session.state.value === 'guest' ? 'account.signInHint' : 'account.unavailableHint') }}
    </p>
    <div class="row">
      <button
        v-if="session.state.value === 'guest'"
        class="btn btn-primary"
        type="button"
        @click="session.signIn"
      >
        {{ t('account.signIn') }}
      </button>
      <button
        v-else
        class="btn"
        type="button"
        @click="session.reload"
      >
        {{ t('common.retry') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.sign-in { max-width: 32rem; }
</style>
