<script setup lang="ts">
import { ChevronRight, DatabaseZap } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useAsync } from '../../shared/composables/async'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useVerification } from './api'

// One row on the verification page that leads to the school data page. School data has its
// own rules and form, so the verification page only shows whether it is on.
const { t } = useI18n()
const api = useVerification()
const status = useAsync((signal) => api.schoolData(signal))
void status.reload()
const state = computed(() => status.data.value?.state)
</script>

<template>
  <RouterLink
    to="/me/verification/school-data"
    class="card school-data-entry"
  >
    <span
      class="icon-tile"
      style="--tile: var(--c-indigo)"
    ><DatabaseZap aria-hidden="true" /></span>
    <span class="entry-copy">
      <strong>{{ t('verification.schoolData.title') }}</strong>
      <span class="small muted">{{ t('verification.schoolData.entry') }}</span>
    </span>
    <StatusTag
      v-if="state"
      :tone="state === 'active' ? 'success' : 'neutral'"
    >
      {{ t(`verification.schoolData.${state}`) }}
    </StatusTag>
    <ChevronRight
      class="entry-chevron flip-rtl"
      aria-hidden="true"
    />
  </RouterLink>
</template>

<style scoped>
.school-data-entry { display: flex; align-items: center; gap: .875rem; padding: .875rem 1rem; color: inherit; text-decoration: none; transition: background-color .2s; }
.school-data-entry:hover { background: var(--fill); }
.entry-copy { display: grid; flex: 1; gap: .125rem; min-width: 0; }
.entry-chevron { flex: none; width: 1.125rem; height: 1.125rem; color: var(--label-3); }
</style>
