<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAsync } from '../../shared/composables/async'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import MeLayout from '../account/MeLayout.vue'
import { useVerification } from './api'
import SchoolDataCard from './SchoolDataCard.vue'

// School data authorization on its own page. Opening it needs campus eligibility, which the
// verification summary reports.
const { t } = useI18n()
const api = useVerification()
const summary = useAsync((signal) => api.get('Summary', '/api/v1/verification/summary', signal))
void summary.reload()
</script>

<template>
  <MeLayout
    :title="t('verification.schoolData.title')"
    :description="t('verification.schoolData.intro')"
    back="/me/verification"
    :back-label="t('verification.unified.title')"
  >
    <ErrorNotice
      v-if="summary.status.value === 'error'"
      :code="summary.error.value"
      @retry="summary.reload()"
    />
    <SchoolDataCard
      v-else-if="summary.data.value"
      standalone
      :eligible="summary.data.value.campus_eligibility"
    />
  </MeLayout>
</template>
