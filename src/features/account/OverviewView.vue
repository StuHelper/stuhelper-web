<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync, useMutation } from '../../shared/composables/async'
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
  { to: '/me/reviews', title: 'me.reviews', text: 'me.links.reviews' },
  { to: '/me/reviews?tab=drafts', title: 'me.reviewTabs.drafts', text: 'me.links.drafts' },
  { to: '/me/resources', title: 'me.resources', text: 'me.links.resources' },
  { to: '/me/requests', title: 'me.requests', text: 'me.links.requests' },
  { to: '/me/storage-accounts', title: 'custody.title', text: 'me.links.storage' },
  { to: '/contributions', title: 'nav.contributions', text: 'me.links.contributions' },
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
    await session.signOut(signingOut.value === 'all')
  } catch (failure) {
    signOutError.value = errorCode(failure)
  } finally {
    signOutBusy.value = false
  }
}
</script>

<template>
  <MeLayout
    :title="t('me.title')"
    :description="t('me.intro')"
  >
    <div
      v-if="profile && session.session.value"
      class="stack-lg"
    >
      <section class="card stack">
        <div class="row-between">
          <h2>{{ t('me.profile.title') }}</h2>
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
          class="stack"
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
        <dl
          v-else
          class="facts"
        >
          <div>
            <dt>{{ t('me.profile.nickname') }}</dt>
            <dd>{{ profile.nickname }}</dd>
          </div>
          <div>
            <dt>{{ t('me.profile.sessionExpires') }}</dt>
            <dd>{{ format.dateTime(session.session.value.expires_at) }}</dd>
          </div>
          <div v-if="session.session.value.administrator">
            <dt>{{ t('me.profile.role') }}</dt>
            <dd>
              <StatusTag tone="info">
                {{ t('me.profile.administrator') }}
              </StatusTag>
            </dd>
          </div>
        </dl>
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
          <RouterLink to="/me/verification">
            {{ t('me.status.manage') }}
          </RouterLink>
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
        <div class="grid">
          <article class="card stack-sm">
            <h3 class="small muted">
              {{ t('verification.campus') }}
            </h3>
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
          </article>
          <article class="card stack-sm">
            <h3 class="small muted">
              {{ t('verification.identity') }}
            </h3>
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
          </article>
          <article class="card stack-sm">
            <h3 class="small muted">
              {{ t('verification.phone') }}
            </h3>
            <StatusTag :tone="session.session.value.phone_bound ? 'success' : 'neutral'">
              {{ t(session.session.value.phone_bound ? 'verification.phoneBound' : 'verification.phoneMissing') }}
            </StatusTag>
            <span class="subtle">{{ t('me.status.phoneHint') }}</span>
          </article>
        </div>
      </section>

      <section class="section">
        <h2>{{ t('me.content') }}</h2>
        <ul class="grid shortcuts">
          <li
            v-for="link in links"
            :key="link.to"
          >
            <RouterLink
              class="card card-link stack-sm"
              :to="link.to"
            >
              <span class="card-title">{{ t(link.title) }}</span>
              <span class="small muted">{{ t(link.text) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section class="card stack">
        <h2>{{ t('me.sessions.title') }}</h2>
        <p class="small muted">
          {{ t('me.sessions.hint') }}
        </p>
        <div class="row">
          <button
            class="btn"
            type="button"
            @click="signingOut = 'device'"
          >
            {{ t('account.signOut') }}
          </button>
          <button
            class="btn btn-danger"
            type="button"
            @click="signingOut = 'all'"
          >
            {{ t('account.signOutAll') }}
          </button>
        </div>
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
.shortcuts { list-style: none; }
.shortcuts a { height: 100%; }
</style>
