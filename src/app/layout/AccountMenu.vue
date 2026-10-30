<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { useSession } from '../../shared/session'

const { t } = useI18n()
const session = useSession()
const route = useRoute()
const open = ref(false)
const root = ref<HTMLElement>()

function close() { open.value = false }
function outside(event: PointerEvent) { if (open.value && root.value && event.target instanceof Node && !root.value.contains(event.target)) close() }
function escape(event: KeyboardEvent) { if (event.key === 'Escape' && open.value) { close(); root.value?.querySelector('button')?.focus() } }
watch(() => route.fullPath, close)
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) })
</script>

<template>
  <div
    ref="root"
    class="account"
  >
    <template v-if="session.state.value === 'member' && session.session.value">
      <button
        class="btn btn-sm account-trigger"
        type="button"
        aria-haspopup="true"
        :aria-expanded="open"
        aria-controls="account-menu"
        @click="open = !open"
      >
        <span
          class="account-avatar"
          aria-hidden="true"
        >{{ [...session.session.value.profile.nickname][0] }}</span>
        <span class="account-name truncate">{{ session.session.value.profile.nickname }}</span>
      </button>
      <nav
        v-show="open"
        id="account-menu"
        class="account-menu"
        :aria-label="t('nav.account')"
      >
        <RouterLink to="/me">
          {{ t('me.title') }}
        </RouterLink>
        <RouterLink to="/me/reviews">
          {{ t('me.reviews') }}
        </RouterLink>
        <RouterLink to="/me/resources">
          {{ t('me.resources') }}
        </RouterLink>
        <RouterLink to="/me/verification">
          {{ t('verification.title') }}
        </RouterLink>
      </nav>
    </template>
    <button
      v-else-if="session.state.value === 'guest'"
      class="btn btn-sm btn-primary"
      type="button"
      @click="session.signIn"
    >
      {{ t('account.signIn') }}
    </button>
    <span
      v-else-if="session.state.value === 'error'"
      class="account-error"
    >
      <span class="subtle">{{ t('account.unavailable') }}</span>
      <button
        class="btn btn-sm btn-ghost"
        type="button"
        @click="session.reload"
      >
        {{ t('common.retry') }}
      </button>
    </span>
  </div>
</template>

<style scoped>
.account { position: relative; }
.account-trigger { max-width: 12rem; }
.account-avatar { display: inline-grid; place-items: center; width: 1.45rem; height: 1.45rem; border-radius: 50%; background: var(--accent-soft); color: var(--accent-strong); font-size: .78rem; font-weight: 700; }
.account-menu { position: absolute; inset-inline-end: 0; top: calc(100% + .4rem); z-index: 30; display: grid; min-width: 12rem; padding: .35rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: 0 12px 30px rgb(0 0 0 / 14%); }
.account-menu a { padding: .5rem .7rem; border-radius: var(--radius-sm); color: var(--text); text-decoration: none; }
.account-menu a:hover, .account-menu a.router-link-exact-active { background: var(--accent-soft); color: var(--accent-strong); }
.account-error { display: inline-flex; align-items: center; gap: .25rem; }
</style>
<style scoped>
@media (max-width: 520px) {
  .account-name { display: none; }
}
</style>
