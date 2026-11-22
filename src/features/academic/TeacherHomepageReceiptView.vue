<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import MeLayout from '../account/MeLayout.vue'
import { supervisorKey, useTeacherHomepage } from './teacherHomepage'

// The receipt of one homepage request, opened from the request list or the result
// notification. It shows what was asked and the school's answer; a request removed
// after its retention period, or no longer the reader's, reads as not found.
const props = defineProps<{ requestId: string }>()
const { t } = useI18n()
const format = useFormat()
const api = useTeacherHomepage()
const request = useAsync((signal) => api.myRequest(props.requestId, signal))
watch(() => props.requestId, () => { void request.reload() }, { immediate: true })
const tone = computed(() => (request.data.value?.status === 'approved' ? 'success' : request.data.value?.status === 'rejected' ? 'danger' : 'info'))
const back = computed(() => (request.data.value ? `/me/teacher-homepage/${encodeURIComponent(request.data.value.teacher_id)}` : '/me/verification/teacher'))
</script>

<template>
  <MeLayout
    :title="t('teacherHomepage.receipt.title')"
    :back="back"
    :back-label="t('teacherHomepage.manage')"
  >
    <AsyncState
      :status="request.status.value"
      :error="request.error.value"
      @retry="request.reload()"
    >
      <article
        v-if="request.data.value"
        class="card stack"
      >
        <div class="row-between">
          <h2 class="d-title">
            {{ t(`teacherHomepage.request.kinds.${request.data.value.kind}`) }} · {{ request.data.value.field.label ?? t(`teacherHomepage.fields.${request.data.value.field.field}`) }}
          </h2>
          <StatusTag :tone="tone">
            {{ t(`teacherHomepage.request.status.${request.data.value.status}`) }}
          </StatusTag>
        </div>
        <dl class="facts">
          <div>
            <dt>{{ t('teacherHomepage.receipt.submitted') }}</dt>
            <dd>{{ format.dateTime(request.data.value.created_at) }}</dd>
          </div>
          <div v-if="request.data.value.resolved_at">
            <dt>{{ t('teacherHomepage.receipt.resolved') }}</dt>
            <dd>{{ format.dateTime(request.data.value.resolved_at) }}</dd>
          </div>
        </dl>
        <div
          v-if="request.data.value.value?.text"
          class="stack-sm"
        >
          <h3>{{ t('teacherHomepage.request.value') }}</h3>
          <p class="prewrap">
            {{ request.data.value.value.text }}
          </p>
        </div>
        <p v-else-if="request.data.value.value?.supervisors">
          {{ request.data.value.value.supervisors.length ? format.list(request.data.value.value.supervisors.map((item) => t(`teacherHomepage.supervisors.${supervisorKey(item)}`))) : t('teacherHomepage.receipt.cleared') }}
        </p>
        <p v-else-if="request.data.value.value?.photo">
          {{ t('teacherHomepage.receipt.photo') }}
        </p>
        <div class="stack-sm">
          <h3>{{ t('teacherHomepage.request.message') }}</h3>
          <p class="prewrap">
            {{ request.data.value.message }}
          </p>
        </div>
        <div
          v-if="request.data.value.resolution_note"
          class="stack-sm"
        >
          <h3>{{ t('teacherHomepage.receipt.note') }}</h3>
          <p class="prewrap">
            {{ request.data.value.resolution_note }}
          </p>
        </div>
      </article>
    </AsyncState>
  </MeLayout>
</template>
