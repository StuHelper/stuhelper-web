<script setup lang="ts">
import { useNotificationTitle } from '../notifications/title'
import { BadgeCheck, ChevronRight, FileText, PenLine } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { feature, useCapabilities, useLinkAvailable } from '../../shared/capabilities'
import { RouterLink } from 'vue-router'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useMutation } from '../../shared/composables/async'
import { useSession, type Profile, type ProfileUpdate } from '../../shared/session'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useErrorText } from '../../shared/ui/messages'
import { useFormat } from '../../app/i18n'
import { useAcademic } from '../academic/api'
import { useFavoritesApi } from '../favorites/api'
import { useNotificationsApi } from '../notifications/api'
import { useResourcesApi } from '../resources/api'
import { useWalletApi } from '../wallet/api'
import { useAccess } from './access'
import { meGroups, meLinks } from './links'
import MeLayout from './MeLayout.vue'

// Personal center overview. Campus eligibility, independent identity and phone
// binding are separate states and are shown separately.
const { t } = useI18n()
const errorText = useErrorText()
const session = useSession()
const save = useMutation()
const editing = ref(false)
const nickname = ref('')
const nicknameValid = computed(() => !!nickname.value.trim() && [...nickname.value.trim()].length <= 20)
const saved = ref('')
const current = ref<Profile>()
// The dialog keeps showing the chosen scope while it closes, so its text does not
// switch to the other scope during the closing animation.
const signOutScope = ref<'device' | 'all'>('device')
const signOutOpen = ref(false)
function askSignOut(scope: 'device' | 'all') {
  signOutScope.value = scope
  signOutError.value = ''
  signOutOpen.value = true
}
const signOutError = ref('')
const signOutBusy = ref(false)
const available = useLinkAvailable()

const format = useFormat()
const access = useAccess()
const verified = computed(() => access.state.value === 'verified')
const academic = useAcademic()
const resources = useResourcesApi()
const favorites = useFavoritesApi()
const wallet = useWalletApi()
const notifications = useNotificationsApi()

// Personal numbers and recent activity. Each loads on its own; a missing number shows a
// dash instead of hiding the card, so the layout does not jump.
const overview = useAsync((signal) => academic.overview(signal))
const ownResources = useAsync((signal) => resources.mySummary(signal))
const favoriteCount = useAsync(async (signal) => (await favorites.allFolders(signal)).reduce((sum, folder) => sum + folder.item_count, 0))
// Ivory is stored in hundredths; the card shows the balance in whole units with any cents.
const balance = useAsync(async (signal) => (await wallet.wallet(signal)).ivory_minor / 100)
const activity = useAsync(async (signal) => (await notifications.list(undefined, '', signal)).items.slice(0, 4))
// Optional modules (favorites, wallet, notifications) are only read when this deployment
// runs them; their numbers and links are hidden otherwise.
const capabilities = useCapabilities()
const known = computed(() => capabilities.status.value === 'ready' || capabilities.status.value === 'error')
watch(() => [verified.value, known.value] as const, ([value, ready]) => {
  if (!value || !ready) return
  void overview.reload()
  void ownResources.reload()
  if (capabilities.has(feature.favorites)) void favoriteCount.reload()
  if (capabilities.has(feature.wallet)) void balance.reload()
  if (capabilities.has(feature.notifications)) void activity.reload()
}, { immediate: true })
const dash = '\u2014'
const stats = computed(() => [
  { to: '/me/reviews', label: 'browse.reviews', value: overview.data.value?.review_count },
  { to: '/me/resources', label: 'browse.resourcesShort', value: ownResources.data.value?.resource_count },
  ...(capabilities.has(feature.favorites) && available('/me/favorites') ? [{ to: '/me/favorites', label: 'browse.favorites', value: favoriteCount.data.value }] : []),
  ...(capabilities.has(feature.wallet) && available('/me/wallet') ? [{ to: '/me/wallet', label: 'browse.ivory', value: balance.data.value }] : []),
])
const pending = computed(() => (overview.data.value?.pending_courses.state === 'available' ? overview.data.value.pending_courses : undefined))
const hasTodos = computed(() => !!pending.value?.count || !!overview.data.value?.draft_count)
const noticeTitle = useNotificationTitle()
const profile = computed(() => session.session.value?.profile)
onMounted(() => {
  nickname.value = profile.value?.nickname ?? ''
})

// Phones have no side navigation, so this page lists every personal page, grouped like a settings menu.
const menu = computed(() => meGroups.map((group) => ({ ...group, links: meLinks.filter((link) => link.group === group.id && available(link.to)) })).filter((group) => group.links.length))

function startEdit() {
  nickname.value = profile.value?.nickname ?? ''
  current.value = undefined
  saved.value = ''
  editing.value = true
}

async function submit() {
  if (!nicknameValid.value || !profile.value) return
  saved.value = ''
  const body: ProfileUpdate = { nickname: nickname.value.trim(), revision: profile.value.revision }
  const result = await save.run('profile', body, (value, key) => session.saveProfile(value, key))
  if (result) {
    editing.value = false
    saved.value = t('me.profile.saved')
    return
  }
  // Another device changed the profile: show the saved version and let the user choose.
  if (save.error.value === 'conflict') {
    try {
      current.value = await session.currentProfile()
    } catch {
      current.value = undefined
    }
  }
}

async function retry() {
  if (await save.retry()) {
    editing.value = false
    saved.value = t('me.profile.saved')
  }
}

function useCurrent() {
  if (!current.value) return
  nickname.value = current.value.nickname
  void session.reload()
  current.value = undefined
  save.dismiss()
  editing.value = false
}

async function keepMine() {
  if (!current.value) return
  // Resubmit the typed nickname against the version now on the server.
  if (!nicknameValid.value) return
  const body: ProfileUpdate = { nickname: nickname.value.trim(), revision: current.value.revision }
  current.value = undefined
  const result = await save.run('profile', body, (value, key) => session.saveProfile(value, key))
  if (result) {
    editing.value = false
    saved.value = t('me.profile.saved')
  }
}

async function signOut() {
  if (!signOutOpen.value) return
  signOutBusy.value = true
  signOutError.value = ''
  try {
    await session.signOut(signOutScope.value === 'all')
  } catch (failure) {
    signOutError.value = errorCode(failure)
  } finally {
    signOutBusy.value = false
  }
}
</script>

<template>
  <MeLayout :title="t('me.title')">
    <div
      v-if="profile && session.session.value"
      class="stack-lg"
    >
      <section class="card profile">
        <div class="profile-head">
          <span
            class="profile-avatar"
            aria-hidden="true"
          >{{ [...profile.nickname][0] || t('nav.me').slice(0, 1) }}</span>
          <div class="profile-copy">
            <h2 class="truncate">
              {{ profile.nickname_required && !profile.nickname ? t('profile.nicknameRequired') : profile.nickname }}
            </h2>
            <p
              v-if="verified"
              class="row subtle badge"
            >
              <BadgeCheck aria-hidden="true" />{{ t('browse.verifiedStudent') }}
            </p>
            <StatusTag
              v-if="session.session.value.administrator"
              tone="info"
            >
              {{ t('me.profile.administrator') }}
            </StatusTag>
          </div>
          <button
            v-if="!editing"
            class="btn btn-sm"
            type="button"
            @click="startEdit"
          >
            {{ t('me.profile.edit') }}
          </button>
        </div>
        <div
          class="row"
          :aria-label="t('me.status.title')"
        >
          <StatusTag :tone="access.summary.value?.campus_eligibility ? 'success' : 'neutral'">
            {{ t('verification.campus') }} · {{ t(access.summary.value ? (access.summary.value.campus_eligibility ? 'verification.eligible' : 'verification.notEligible') : 'me.status.unknown') }}
          </StatusTag>
          <StatusTag :tone="access.summary.value?.identity_verified ? 'success' : 'neutral'">
            {{ t('verification.identity') }} · {{ t(access.summary.value ? (access.summary.value.identity_verified ? 'verification.identityVerified' : 'verification.identityMissing') : 'me.status.unknown') }}
          </StatusTag>
          <StatusTag :tone="session.session.value.phone_bound ? 'success' : 'warning'">
            {{ t('verification.phone') }} · {{ t(session.session.value.phone_bound ? 'verification.phoneBound' : 'verification.phoneMissing') }}
          </StatusTag>
        </div>
        <form
          v-if="editing"
          class="stack profile-form"
          @submit.prevent="submit"
        >
          <div class="field">
            <label class="field">
              <span class="field-label">{{ t('me.profile.nickname') }}</span>
              <input
                v-model="nickname"
                class="input"
                :aria-invalid="[...nickname.trim()].length > 20"
                required
                :disabled="save.busy.value || save.uncertain.value"
              >
            </label>
            <span class="field-hint">{{ t('me.profile.nicknameHint') }}</span>
          </div>
          <div
            v-if="current"
            class="notice notice-warning stack-sm"
          >
            <p>{{ t('me.profile.conflict', { nickname: current.nickname }) }}</p>
            <div class="row">
              <button
                class="btn btn-sm"
                type="button"
                @click="useCurrent"
              >
                {{ t('me.profile.useCurrent') }}
              </button>
              <button
                class="btn btn-sm"
                type="button"
                @click="keepMine"
              >
                {{ t('me.profile.keepMine') }}
              </button>
            </div>
          </div>
          <MutationNotice
            v-else
            :busy="save.busy.value"
            :error="save.error.value"
            :uncertain="save.uncertain.value"
            @retry="retry"
          />
          <div class="form-actions">
            <button
              class="btn btn-primary"
              type="submit"
              :disabled="save.busy.value || save.uncertain.value || !nicknameValid"
            >
              {{ t('common.save') }}
            </button>
            <button
              class="btn"
              type="button"
              :disabled="save.busy.value || save.uncertain.value"
              @click="editing = false"
            >
              {{ t('common.cancel') }}
            </button>
          </div>
        </form>
        <p
          v-if="saved"
          class="notice notice-success"
          role="status"
        >
          {{ saved }}
        </p>
      </section>

      <nav
        v-if="verified"
        class="stats"
        :aria-label="t('browse.myStats')"
      >
        <RouterLink
          v-for="s in stats"
          :key="s.to"
          class="card stat"
          :to="s.to"
        >
          <b class="d-stat">{{ s.value === undefined ? dash : format.number(s.value) }}</b><span class="subtle">{{ t(s.label) }}</span>
        </RouterLink>
      </nav>

      <section
        v-if="verified && hasTodos"
        class="card stack desk-only"
        aria-labelledby="me-todo"
      >
        <h2
          id="me-todo"
          class="d-title"
        >
          {{ t('browse.todo') }}
        </h2>
        <RouterLink
          v-if="pending?.count"
          class="todo"
          to="/me/reviews"
        >
          <span
            class="icon-tile"
            style="--tile:var(--c-indigo)"
          ><PenLine aria-hidden="true" /></span>
          <span class="group-body"><b>{{ t('browse.pendingReviews', { count: format.number(pending.count) }) }}</b><span class="subtle">{{ t('browse.lastTermDoneHint') }}</span></span>
          <ChevronRight
            class="chevron"
            aria-hidden="true"
          />
        </RouterLink>
        <RouterLink
          v-if="overview.data.value?.draft_count"
          class="todo"
          to="/me/reviews?tab=drafts"
        >
          <span
            class="icon-tile"
            style="--tile:var(--c-orange)"
          ><FileText aria-hidden="true" /></span>
          <span class="group-body"><b>{{ t('browse.draftsPending', { count: format.number(overview.data.value.draft_count) }) }}</b></span>
          <ChevronRight
            class="chevron"
            aria-hidden="true"
          />
        </RouterLink>
      </section>

      <section
        v-if="verified && activity.data.value?.length"
        class="stack desk-only"
        aria-labelledby="me-recent"
      >
        <div class="row-between">
          <h2
            id="me-recent"
            class="d-title"
          >
            {{ t('browse.recentActivity') }}
          </h2>
          <RouterLink
            class="small"
            to="/notifications"
          >
            {{ t('browse.allNotifications') }}
          </RouterLink>
        </div>
        <ul class="group">
          <li
            v-for="n in activity.data.value"
            :key="n.id"
          >
            <RouterLink
              class="group-row"
              to="/notifications"
            >
              <span class="group-body"><span class="group-title">{{ noticeTitle(n) }}</span></span>
              <span class="subtle when">{{ format.ago(n.created_at) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>


      <!-- The content group also shows on wide screens until the account is verified, where the page has little else. -->
      <section
        v-for="group in menu"
        :key="group.id"
        class="section"
        :class="{ 'phone-only': verified || group.id !== 'content' }"
        :aria-labelledby="`me-group-${group.id}`"
      >
        <h2
          :id="`me-group-${group.id}`"
          class="d-title"
        >
          {{ t(group.title) }}
        </h2>
        <ul class="group">
          <li
            v-for="link in group.links"
            :key="link.to"
          >
            <RouterLink
              class="group-row has-icon"
              :to="link.to"
            >
              <span
                class="icon-tile"
                :style="{ '--tile': link.tile }"
              ><component
                :is="link.icon"
                aria-hidden="true"
              /></span>
              <span class="group-body">
                <span class="group-title">{{ t(link.label) }}</span>
                <span
                  v-if="link.detail"
                  class="group-detail"
                >{{ t(link.detail) }}</span>
              </span>
              <ChevronRight
                class="chevron"
                aria-hidden="true"
              />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section class="section">
        <h2 class="d-title">
          {{ t('me.sessions.title') }}
        </h2>
        <div class="group">
          <button
            class="group-row sign-out"
            type="button"
            @click="askSignOut('device')"
          >
            {{ t('account.signOut') }}
          </button>
          <button
            class="group-row sign-out danger"
            type="button"
            @click="askSignOut('all')"
          >
            {{ t('account.signOutAll') }}
          </button>
        </div>
        <p class="subtle">
          {{ t('me.sessions.hint') }}
        </p>
      </section>
    </div>

    <ConfirmDialog
      :open="signOutOpen"
      :title="t(signOutScope === 'all' ? 'account.signOutAll' : 'account.signOut')"
      :message="t(signOutScope === 'all' ? 'me.sessions.allConfirm' : 'me.sessions.deviceConfirm')"
      :danger="signOutScope === 'all'"
      :busy="signOutBusy"
      @confirm="signOut"
      @cancel="signOutOpen = false"
    >
      <p
        v-if="signOutError"
        class="notice notice-error"
        role="alert"
      >
        {{ errorText(signOutError) }}
      </p>
    </ConfirmDialog>
  </MeLayout>
</template>

<style scoped>
.profile { display: grid; gap: 1rem; }
.profile-head { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.profile-avatar { flex: none; display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(145deg, #5e9cff, var(--c-blue)); color: #fff; font-size: 1.75rem; font-weight: 600; }
.profile-copy { display: grid; flex: 1 1 12rem; justify-items: start; gap: .25rem; min-width: 0; }
.profile-copy h2 { max-width: 100%; }
.sign-out { justify-content: center; color: var(--accent); font-weight: 500; }
.sign-out.danger { color: var(--danger); }
.badge { gap: .25rem; margin: 0; }
.badge svg { width: 1rem; height: 1rem; color: var(--accent); }
.stats { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 7rem), 1fr)); }
.stat { display: grid; gap: .125rem; padding: .875rem 1rem; color: inherit; transition: transform .3s var(--spring); }
.stat:hover { text-decoration: none; transform: translateY(-2px); }
.todo { display: flex; align-items: center; gap: .75rem; color: inherit; }
.todo:hover { text-decoration: none; }
.todo:hover b { color: var(--accent); }
.todo b { font-size: .9375rem; font-weight: 550; }
.when { flex: none; }
.desk-only { display: grid; }
.phone-only { display: none; }
/* Phones have no side menu, so this page carries the links there. */
@media (max-width: 760px) { .desk-only { display: none; } .phone-only { display: grid; } }
</style>
