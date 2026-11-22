<script setup lang="ts">
import { FileCheck2 } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import { isolate } from '../../shared/format'
import { useSession, type LegalDocumentId } from '../../shared/session'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import EmailTransferWithdraw from '../verification/EmailTransferWithdraw.vue'
import MeLayout from './MeLayout.vue'

// Privacy and consents: every agreement this account has accepted, in one place. The user
// agreement and privacy policy show the accepted version and time; not agreeing to them any
// more means closing the account. Separate consents, such as delivering school-email codes
// from abroad, can be withdrawn here on their own.
const { t } = useI18n()
const format = useFormat()
const session = useSession()
const order: LegalDocumentId[] = ['terms', 'privacy']
const consent = useAsync((signal) => session.consentStatus(signal))
void consent.reload()
const documents = computed(() => {
  const value = consent.data.value
  return value ? order.map((id) => ({ id, document: value.documents[id] })) : []
})
</script>

<template>
  <MeLayout
    :title="t('privacy.title')"
    :description="t('privacy.description')"
  >
    <section
      class="section"
      aria-labelledby="privacy-agreements"
    >
      <h2
        id="privacy-agreements"
        class="d-title"
      >
        {{ t('privacy.agreements') }}
      </h2>
      <ErrorNotice
        v-if="consent.status.value === 'error'"
        :code="consent.error.value"
        @retry="consent.reload()"
      />
      <ul
        v-else-if="documents.length"
        class="group"
      >
        <li
          v-for="row in documents"
          :key="row.id"
          class="group-row has-icon"
        >
          <span
            class="icon-tile"
            style="--tile:var(--c-indigo)"
          ><FileCheck2 aria-hidden="true" /></span>
          <span class="group-body">
            <span class="group-title">{{ t(`consent.documents.${row.id}`) }}</span>
            <span class="group-detail">
              {{ row.document.receipt
                ? t('privacy.acceptedVersion', { version: isolate(row.document.version), time: format.dateTime(row.document.receipt.accepted_at) })
                : t('privacy.pendingVersion', { version: isolate(row.document.version) }) }}
            </span>
          </span>
          <a
            class="btn btn-sm"
            :href="row.document.url"
            target="_blank"
            rel="noopener"
          >{{ t('privacy.read') }}</a>
        </li>
      </ul>
      <p
        v-else
        class="skeleton"
      >
        <span aria-hidden="true" />
      </p>
      <p class="subtle small">
        {{ t('privacy.withdrawAgreements') }}
        <RouterLink to="/me/account#security-closure">
          {{ t('privacy.closure') }}
        </RouterLink>
      </p>
    </section>

    <EmailTransferWithdraw always />

    <section
      class="section"
      aria-labelledby="privacy-documents"
    >
      <h2
        id="privacy-documents"
        class="d-title"
      >
        {{ t('privacy.documents') }}
      </h2>
      <p class="row">
        <RouterLink
          class="btn btn-sm"
          to="/legal/terms"
        >
          {{ t('consent.documents.terms') }}
        </RouterLink>
        <RouterLink
          class="btn btn-sm"
          to="/legal/privacy"
        >
          {{ t('consent.documents.privacy') }}
        </RouterLink>
        <RouterLink
          class="btn btn-sm"
          to="/legal/email-transfer"
        >
          {{ t('privacy.transferDocument') }}
        </RouterLink>
      </p>
    </section>
  </MeLayout>
</template>
