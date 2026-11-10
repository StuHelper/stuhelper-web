<script setup lang="ts">
import { LockKeyhole } from 'lucide-vue-next'
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
    class="card sign-in"
  >
    <span
      class="sign-in-icon"
      aria-hidden="true"
    ><LockKeyhole /></span>
    <h2>{{ t(session.state.value === 'guest' ? 'account.signInRequired' : 'account.unavailable') }}</h2>
    <p class="muted">
      {{ t(session.state.value === 'guest' ? 'account.signInHint' : 'account.unavailableHint') }}
    </p>
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
  </section>
</template>

<style scoped>
.sign-in { display: grid; justify-items: center; gap: .75rem; padding-block: clamp(2rem, 6vw, 3.5rem); text-align: center; }
.sign-in-icon { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); }
.sign-in-icon svg { width: 28px; height: 28px; }
.sign-in .muted { max-width: 28em; }
</style>
