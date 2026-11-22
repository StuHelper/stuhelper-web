<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync, usePaged } from '../../shared/composables/async'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic } from './api'
import TeacherHomepageRequestForm from './TeacherHomepageRequestForm.vue'
import { useTeacherHomepage, type HomepageRequest } from './teacherHomepage'

// The teacher's own homepage requests for one catalog entry. Reached from the teacher page
// or from the teacher credential, so a teacher whose page is not open yet can still ask.
// The server checks the active credential and the school; the page only offers the form.
const props = defineProps<{ teacherId: string }>()
const { t } = useI18n()
const format = useFormat()
const academic = useAcademic()
const api = useTeacherHomepage()

const name = useAsync(async (signal) => (await academic.lookup([props.teacherId], signal)).get(props.teacherId)?.name ?? '')
const requests = usePaged<HomepageRequest>((after, signal) => api.myRequests(props.teacherId, after, signal))
watch(() => props.teacherId, () => { void name.reload(); void requests.reload() }, { immediate: true })
const formState = ref<'closed' | 'editing' | 'sent'>('closed')
const formKey = ref(0)
function saved() {
  formState.value = 'sent'
  void requests.reload()
}
function another() {
  formKey.value++
  formState.value = 'editing'
}
const tone = (status: HomepageRequest['status']) => (status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'info')
const title = computed(() => (name.data.value ? t('teacherHomepage.manageTitle', { name: name.data.value }) : t('teacherHomepage.manage')))
</script>

<template>
  <MeLayout
    :title="title"
    :description="t('teacherHomepage.manageDescription')"
    back="/me/verification/teacher"
    :back-label="t('verification.unified.title')"
  >
    <section
      class="section"
      aria-labelledby="homepage-new"
    >
      <div class="row-between">
        <h2
          id="homepage-new"
          class="d-title"
        >
          {{ t('teacherHomepage.request.title') }}
        </h2>
        <button
          v-if="formState !== 'editing'"
          class="btn btn-sm btn-primary"
          type="button"
          @click="another"
        >
          {{ t('teacherHomepage.request.start') }}
        </button>
      </div>
      <div
        v-if="formState !== 'closed'"
        class="card"
      >
        <TeacherHomepageRequestForm
          :key="formKey"
          :teacher-id="teacherId"
          @saved="saved"
        />
      </div>
      <p class="subtle small">
        {{ t('teacherHomepage.request.retention') }}
      </p>
    </section>

    <section
      class="section"
      aria-labelledby="homepage-requests"
    >
      <h2
        id="homepage-requests"
        class="d-title"
      >
        {{ t('teacherHomepage.request.history') }}
      </h2>
      <ErrorNotice
        v-if="requests.status.value === 'error' && !requests.items.value.length"
        :code="requests.error.value"
        @retry="requests.reload"
      />
      <PagedState
        v-else
        :status="requests.status.value"
        :error="requests.error.value"
        :count="requests.items.value.length"
        :next="requests.next.value"
        :appending="requests.appending.value"
        :empty-text="t('teacherHomepage.request.none')"
        @retry="requests.reload"
        @more="requests.loadMore"
      >
        <ul class="group">
          <li
            v-for="item in requests.items.value"
            :key="item.id"
          >
            <RouterLink
              class="group-row"
              :to="`/me/teacher-homepage/requests/${encodeURIComponent(item.id)}`"
            >
              <span class="group-body">
                <span class="group-title">{{ t(`teacherHomepage.request.kinds.${item.kind}`) }} · {{ item.field.label ?? t(`teacherHomepage.fields.${item.field.field}`) }}</span>
                <span class="subtle">{{ format.dateTime(item.created_at) }}</span>
              </span>
              <StatusTag :tone="tone(item.status)">
                {{ t(`teacherHomepage.request.status.${item.status}`) }}
              </StatusTag>
            </RouterLink>
          </li>
        </ul>
      </PagedState>
    </section>
  </MeLayout>
</template>
