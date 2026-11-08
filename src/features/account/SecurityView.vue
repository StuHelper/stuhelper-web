<script setup lang="ts">
import { Fingerprint, LogOut, Phone } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { isolate } from '../../shared/format'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import { useSession } from '../../shared/session'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import QqBinding from '../qq/QqBinding.vue'
import { maskedIdentity, useVerification } from '../verification/api'
import { useClosureApi, type Closure } from './closure'
import MeLayout from './MeLayout.vue'

// Account and security: identity facts, QQ binding, signing out everywhere and closing
// the StuHelper account. Each section loads and fails on its own.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const session = useSession()
const verification = useVerification()
const closures = useClosureApi()

const identity = useAsync((signal) => verification.get('Summary', '/api/v1/verification/summary', signal))
void identity.reload()
const masked = computed(() => maskedIdentity(identity.data.value))

const signingOut = ref(false)
const signOutOpen = ref(false)
async function signOutAll() {
  signingOut.value = true
  try {
    await session.signOut(true)
  } catch (failure) {
    toast(errorText(errorCode(failure)))
    signingOut.value = false
  }
}

// Closure: request with an explicit acknowledgement, then follow the server's progress.
const closure = useAsync((signal) => closures.current(signal))
void closure.reload()
const active = computed(() => {
  const value = closure.data.value
  return value && value.state !== 'cancelled' ? value : undefined
})
const requestOpen = ref(false)
const acknowledged = ref(false)
const phrase = ref('')
const confirmPhrase = computed(() => t('security.closure.phrase'))
const working = ref(false)
async function requestClosure() {
  if (!acknowledged.value || phrase.value.trim() !== confirmPhrase.value || working.value) return
  working.value = true
  try {
    closure.data.value = await closures.request(crypto.randomUUID())
    requestOpen.value = false
    acknowledged.value = false
    phrase.value = ''
    toast(t('security.closure.requested'))
  } catch (failure) {
    toast(errorText(errorCode(failure)))
  } finally {
    working.value = false
  }
}
const cancelOpen = ref(false)
async function cancelClosure(value: Closure) {
  working.value = true
  try {
    closure.data.value = await closures.cancel(value.id, crypto.randomUUID())
    cancelOpen.value = false
    toast(t('security.closure.cancelled'))
  } catch (failure) {
    toast(errorText(errorCode(failure)))
    void closure.reload()
  } finally {
    working.value = false
  }
}
const canCancel = (value: Closure) => value.state === 'cooling' && Date.parse(value.cooling_ends_at) > Date.now()
</script>

<template>
  <MeLayout
    :title="t('security.title')"
    :description="t('security.description')"
  >
    <section
      class="section"
      aria-labelledby="security-identity"
    >
      <h2
        id="security-identity"
        class="d-title"
      >
        {{ t('security.identity') }}
      </h2>
      <ul class="group">
        <li class="group-row has-icon">
          <span
            class="icon-tile"
            style="--tile:var(--c-green)"
          ><Phone aria-hidden="true" /></span>
          <span class="group-body">
            <span class="group-title">{{ t('security.phone') }}</span>
            <span class="group-detail">{{ session.session.value?.phone_bound ? t('security.phoneBound') : t('security.phoneMissing') }}</span>
          </span>
        </li>
        <li class="group-row has-icon">
          <span
            class="icon-tile"
            style="--tile:var(--c-indigo)"
          ><Fingerprint aria-hidden="true" /></span>
          <span class="group-body">
            <span class="group-title">{{ t('security.realName') }}</span>
            <span
              v-if="identity.status.value === 'loading'"
              class="skeleton-tag"
              aria-hidden="true"
            />
            <span
              v-else-if="identity.status.value === 'error'"
              class="group-detail"
            >{{ errorText(identity.error.value) }}</span>
            <span
              v-else
              class="group-detail"
            >{{ identity.data.value?.identity_verified ? (masked ? t('security.realNameMasked', { name: isolate(masked.name), number: isolate(masked.number) }) : t('security.realNameDone')) : t('security.realNamePending') }}</span>
          </span>
          <RouterLink
            v-if="identity.status.value === 'ready'"
            class="btn btn-sm"
            :class="{ 'btn-primary': !identity.data.value?.identity_verified }"
            to="/me/account/identity"
          >
            {{ identity.data.value?.identity_verified ? t('security.view') : t('security.verify') }}
          </RouterLink>
          <button
            v-else-if="identity.status.value === 'error'"
            class="btn btn-sm"
            type="button"
            @click="identity.reload()"
          >
            {{ t('common.retry') }}
          </button>
        </li>
      </ul>
    </section>

    <QqBinding />

    <section
      class="section"
      aria-labelledby="security-devices"
    >
      <h2
        id="security-devices"
        class="d-title"
      >
        {{ t('security.devices') }}
      </h2>
      <div class="card row-between">
        <p class="muted small grow">
          {{ t('security.signOutAllHint') }}
        </p>
        <button
          class="btn btn-sm"
          type="button"
          :disabled="signingOut"
          @click="signOutOpen = true"
        >
          <LogOut aria-hidden="true" />{{ t('security.signOutAll') }}
        </button>
      </div>
    </section>

    <section
      class="section"
      aria-labelledby="security-closure"
    >
      <h2
        id="security-closure"
        class="d-title"
      >
        {{ t('security.closure.title') }}
      </h2>
      <ErrorNotice
        v-if="closure.status.value === 'error'"
        :code="closure.error.value"
        @retry="closure.reload()"
      />
      <div
        v-else-if="active"
        class="card stack-sm"
        role="status"
      >
        <p>{{ t(`security.closure.states.${active.state}`, { date: format.dateTime(active.cooling_ends_at) }) }}</p>
        <p
          v-if="active.blocker"
          class="muted small"
        >
          {{ t(`security.closure.blockers.${active.blocker}`) }}
        </p>
        <div
          v-if="canCancel(active)"
          class="row"
        >
          <button
            class="btn btn-sm"
            type="button"
            :disabled="working"
            @click="cancelOpen = true"
          >
            {{ t('security.closure.cancel') }}
          </button>
        </div>
      </div>
      <div
        v-else-if="closure.status.value === 'ready'"
        class="card row-between"
      >
        <p class="muted small grow">
          {{ t('security.closure.hint') }}
        </p>
        <button
          class="btn btn-sm btn-danger"
          type="button"
          @click="requestOpen = true"
        >
          {{ t('security.closure.request') }}
        </button>
      </div>
    </section>

    <ConfirmDialog
      :open="signOutOpen"
      :title="t('security.signOutAll')"
      :message="t('security.signOutAllConfirm')"
      :confirm-label="t('security.signOutAll')"
      :busy="signingOut"
      @confirm="signOutAll"
      @cancel="signOutOpen = false"
    />
    <ConfirmDialog
      :open="cancelOpen"
      :title="t('security.closure.cancel')"
      :message="t('security.closure.cancelConfirm')"
      :confirm-label="t('security.closure.cancel')"
      :busy="working"
      @confirm="active && cancelClosure(active)"
      @cancel="cancelOpen = false"
    />
    <SheetDialog
      :open="requestOpen"
      :title="t('security.closure.request')"
      :description="t('security.closure.cooling')"
      @close="requestOpen = false"
    >
      <ul class="stack-sm muted small terms">
        <li>{{ t('security.closure.scope') }}</li>
        <li>{{ t('security.closure.assets') }}</li>
        <li>{{ t('security.closure.content') }}</li>
      </ul>
      <label class="check">
        <input
          v-model="acknowledged"
          type="checkbox"
        >
        <span>{{ t('security.closure.points') }}</span>
      </label>
      <label class="field">
        <span class="field-label">{{ t('security.closure.typeToConfirm', { phrase: confirmPhrase }) }}</span>
        <input
          v-model="phrase"
          class="input"
          autocomplete="off"
        >
      </label>
      <div class="form-actions">
        <button
          class="btn btn-danger"
          type="button"
          :disabled="!acknowledged || phrase.trim() !== confirmPhrase || working"
          @click="requestClosure"
        >
          {{ t('security.closure.submit') }}
        </button>
        <button
          class="btn"
          type="button"
          @click="requestOpen = false"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.grow { flex: 1 1 14rem; }
.terms { padding-inline-start: 1.25rem; list-style: disc; }
.check { display: flex; align-items: flex-start; gap: .5rem; font-size: .9375rem; }
.check input { margin-block-start: .25rem; }
</style>
