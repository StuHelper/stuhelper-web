<script setup lang="ts">
import { Hourglass, LockKeyhole, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { useSession } from '../../shared/session'
import { useAccess } from './access'

// One explanation and one next step for each reason content is not open yet.
// On the gate the address stays unchanged, so signing in returns to this page.
const props = withDefaults(defineProps<{ gate?: boolean }>(), { gate: false })
const { t } = useI18n()
const route = useRoute()
const session = useSession()
const access = useAccess()
const icons = { guest: LockKeyhole, unverified: ShieldCheck, processing: Hourglass, expired: ShieldAlert, unavailable: RefreshCw }
const state = computed(() => {
  const value = access.state.value
  return value === 'loading' || value === 'verified' ? undefined : value
})
const verify = computed(() => (props.gate ? { path: '/me/verification', query: { next: route.fullPath } } : '/me/verification'))
</script>

<template>
  <div
    v-if="access.state.value === 'loading'"
    class="skeleton"
    aria-busy="true"
  >
    <span class="visually-hidden">{{ t('common.loading') }}</span>
    <span aria-hidden="true" />
  </div>
  <section
    v-else-if="state"
    class="card panel"
    :class="{ 'panel-gate': gate }"
    :role="gate ? 'status' : undefined"
  >
    <span
      class="panel-icon"
      aria-hidden="true"
    ><component :is="icons[state]" /></span>
    <component
      :is="gate ? 'h1' : 'h2'"
      class="panel-title"
    >
      {{ t(`gate.${state}.title`) }}
    </component>
    <p class="muted panel-text">
      {{ t(`gate.${state}.text`) }}
    </p>
    <button
      v-if="state === 'guest'"
      class="btn btn-primary"
      type="button"
      @click="session.signIn"
    >
      {{ t('gate.guest.action') }}
    </button>
    <button
      v-else-if="state === 'unavailable'"
      class="btn btn-primary"
      type="button"
      @click="access.retry"
    >
      {{ t('gate.unavailable.action') }}
    </button>
    <RouterLink
      v-else
      class="btn btn-primary"
      :to="verify"
    >
      {{ t(`gate.${state}.action`) }}
    </RouterLink>
  </section>
</template>

<style scoped>
.panel { display: grid; justify-items: center; gap: .625rem; text-align: center; }
.panel-gate { margin-block-start: clamp(1rem, 6vw, 4rem); padding-block: clamp(2rem, 6vw, 3.5rem); }
.panel-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); }
.panel-icon svg { width: 26px; height: 26px; }
.panel-title { font-size: clamp(1.375rem, 1.2rem + .8vw, 1.75rem); font-weight: 650; }
.panel-text { max-width: 30em; }
</style>
