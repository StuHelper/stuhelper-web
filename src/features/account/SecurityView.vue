<script setup lang="ts">
import { Fingerprint, LogOut } from 'lucide-vue-next'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import { useSession } from '../../shared/session'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import QqBinding from '../qq/QqBinding.vue'
import { useVerification } from '../verification/api'
import PhoneManage from './PhoneManage.vue'
import AccountClosure from './AccountClosure.vue'
import MeLayout from './MeLayout.vue'
import { feature, useCapabilities } from '../../shared/capabilities'

const capabilities = useCapabilities()

// Account and security: identity facts, QQ binding, signing out everywhere and closing
// the StuHelper account. Each section loads and fails on its own.
const { t } = useI18n()
// The shared account centre where third-party sign-in such as QQ is linked or unlinked.
const errorText = useErrorText()
const session = useSession()
const verification = useVerification()

const identity = useAsync((signal) => verification.get('Summary', '/api/v1/verification/summary', signal))
void identity.reload()

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
        <PhoneManage />
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
            >{{ identity.data.value?.identity_verified ? t('security.realNameDone') : t('security.realNamePending') }}</span>
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

    <!-- Shown once the module list is known, so the section does not flip from "not open" to live. -->
    <QqBinding
      v-if="capabilities.status.value !== 'idle' && capabilities.status.value !== 'loading'"
      :available="capabilities.has(feature.qq)"
      :open="{ connect: capabilities.has(feature.qqConnect), onebot: capabilities.has(feature.qqOnebot), official: capabilities.has(feature.qqOfficial) }"
    />

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

    <AccountClosure />

    <ConfirmDialog
      :open="signOutOpen"
      :title="t('security.signOutAll')"
      :message="t('security.signOutAllConfirm')"
      :confirm-label="t('security.signOutAll')"
      :busy="signingOut"
      @confirm="signOutAll"
      @cancel="signOutOpen = false"
    />
  </MeLayout>
</template>

<style scoped>
.grow { flex: 1 1 14rem; }
</style>
