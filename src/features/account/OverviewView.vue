<script setup lang="ts">
import { CalendarDays, ChevronRight, FileText, FolderOpen, HardDrive, Inbox, PencilLine } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useMutation } from '../../shared/composables/async'
import { forgetPages } from '../../shared/recent'
import { useSession, type Profile } from '../../shared/session'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useErrorText } from '../../shared/ui/messages'
import { useVerification } from '../verification/api'
import MeLayout from './MeLayout.vue'

// Personal center overview. Campus eligibility, independent identity and phone
// binding are separate states and are shown separately.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const session = useSession()
const verification = useVerification()
const save = useMutation()
const editing = ref(false)
const nickname = ref('')
const saved = ref('')
const current = ref<Profile>()
const signingOut = ref<'' | 'device' | 'all'>('')
const signOutError = ref('')
const signOutBusy = ref(false)

const summary = useAsync((signal) => verification.get('Summary', '/api/v1/verification/summary', signal))
const profile = computed(() => session.session.value?.profile)
watch(() => session.state.value, (state) => {
  if (state === 'member') void summary.reload()
}, { immediate: true })
onMounted(() => {
  nickname.value = profile.value?.nickname ?? ''
})

const links = [
  { to: '/me/courses', title: 'courses.title', text: 'me.links.courses', icon: CalendarDays, tile: 'var(--c-red)' },
  { to: '/me/reviews', title: 'me.reviews', text: 'me.links.reviews', icon: FileText, tile: 'var(--c-blue)' },
  { to: '/me/reviews?tab=drafts', title: 'me.reviewTabs.drafts', text: 'me.links.drafts', icon: PencilLine, tile: 'var(--c-orange)' },
  { to: '/me/resources', title: 'me.resources', text: 'me.links.resources', icon: FolderOpen, tile: '#ffcc00' },
  { to: '/me/requests', title: 'me.requests', text: 'me.links.requests', icon: Inbox, tile: 'var(--c-indigo)' },
  { to: '/me/storage', title: 'nav.contributions', text: 'me.links.storage', icon: HardDrive, tile: 'var(--c-cyan)' },
] as const

function startEdit() {
  nickname.value = profile.value?.nickname ?? ''
  current.value = undefined
  saved.value = ''
  editing.value = true
}

async function submit() {
  if (!profile.value) return
  saved.value = ''
  const body: Profile = { nickname: nickname.value.trim(), revision: profile.value.revision }
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
  const body: Profile = { nickname: nickname.value.trim(), revision: current.value.revision }
  current.value = undefined
  const result = await save.run('profile', body, (value, key) => session.saveProfile(value, key))
  if (result) {
    editing.value = false
    saved.value = t('me.profile.saved')
  }
}

async function signOut() {
  if (!signingOut.value) return
  signOutBusy.value = true
  signOutError.value = ''
  try {
    forgetPages()
    await session.signOut(signingOut.value === 'all')
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
          >{{ [...profile.nickname][0] }}</span>
          <div class="profile-copy">
            <h2 class="truncate">
              {{ profile.nickname }}
            </h2>
            <p class="subtle">
              {{ t('me.profile.sessionExpires') }} · {{ format.dateTime(session.session.value.expires_at) }}
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
                maxlength="64"
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
              :disabled="save.busy.value || save.uncertain.value || !nickname.trim()"
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

      <section class="section">
        <div class="section-head">
          <h2>{{ t('me.status.title') }}</h2>
          <span class="row">
            <RouterLink to="/me/verification">
              {{ t('me.status.manage') }}
            </RouterLink>
            <RouterLink to="/me/account/identity">
              {{ t('me.status.manageIdentity') }}
            </RouterLink>
          </span>
        </div>
        <p
          v-if="summary.status.value === 'error'"
          class="notice notice-error"
          role="alert"
        >
          {{ errorText(summary.error.value) }}
          <button
            class="btn btn-sm"
            type="button"
            @click="summary.reload"
          >
            {{ t('common.retry') }}
          </button>
        </p>
        <div class="group">
          <div class="group-row">
            <span class="group-body group-title">{{ t('verification.campus') }}</span>
            <StatusTag
              v-if="summary.data.value"
              :tone="summary.data.value.campus_eligibility ? 'success' : 'neutral'"
            >
              {{ t(summary.data.value.campus_eligibility ? 'verification.eligible' : 'verification.notEligible') }}
            </StatusTag>
            <span
              v-else
              class="subtle"
            >{{ t(summary.status.value === 'loading' ? 'common.loading' : 'me.status.unknown') }}</span>
          </div>
          <div class="group-row">
            <span class="group-body group-title">{{ t('verification.identity') }}</span>
            <StatusTag
              v-if="summary.data.value"
              :tone="summary.data.value.identity_verified ? 'success' : 'neutral'"
            >
              {{ t(summary.data.value.identity_verified ? 'verification.identityVerified' : 'verification.identityMissing') }}
            </StatusTag>
            <span
              v-else
              class="subtle"
            >{{ t(summary.status.value === 'loading' ? 'common.loading' : 'me.status.unknown') }}</span>
          </div>
          <div class="group-row">
            <span class="group-body">
              <span class="group-title">{{ t('verification.phone') }}</span>
              <span class="group-detail">{{ t('me.status.phoneHint') }}</span>
            </span>
            <StatusTag :tone="session.session.value.phone_bound ? 'success' : 'neutral'">
              {{ t(session.session.value.phone_bound ? 'verification.phoneBound' : 'verification.phoneMissing') }}
            </StatusTag>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>{{ t('me.content') }}</h2>
        <ul class="group">
          <li
            v-for="link in links"
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
                <span class="group-title">{{ t(link.title) }}</span>
                <span class="group-detail">{{ t(link.text) }}</span>
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
        <h2>{{ t('me.sessions.title') }}</h2>
        <div class="group">
          <button
            class="group-row sign-out"
            type="button"
            @click="signingOut = 'device'"
          >
            {{ t('account.signOut') }}
          </button>
          <button
            class="group-row sign-out danger"
            type="button"
            @click="signingOut = 'all'"
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
      :open="signingOut !== ''"
      :title="t(signingOut === 'all' ? 'account.signOutAll' : 'account.signOut')"
      :message="t(signingOut === 'all' ? 'me.sessions.allConfirm' : 'me.sessions.deviceConfirm')"
      :danger="signingOut === 'all'"
      :busy="signOutBusy"
      @confirm="signOut"
      @cancel="signingOut = ''; signOutError = ''"
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
</style>
