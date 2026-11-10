<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { useMutation, usePaged } from '../../shared/composables/async'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import StatusTag from '../../shared/ui/StatusTag.vue'
import { useErrorText } from '../../shared/ui/messages'
import MeLayout from '../account/MeLayout.vue'
import { useResourcesApi, type Receipt } from './api'
import RequestForm from './RequestForm.vue'

// Persistent receipts of withdrawal, complaint and appeal requests with the
// current processing state read from the server.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useResourcesApi()
const retrying = useMutation()
const open = ref<Receipt>()
const openError = ref('')
const appealing = ref(false)
const receipts = usePaged(async (after, signal) => {
  const page = await api.requests({ after }, signal)
  return { items: page.items, next: page.next_cursor }
})
onMounted(receipts.reload)

async function show(id: string) {
  openError.value = ''
  appealing.value = false
  try {
    open.value = await api.request(id)
  } catch (failure) {
    open.value = undefined
    openError.value = errorCode(failure)
  }
}

async function retry() {
  const current = open.value
  if (!current) return
  const result = await retrying.run(`request:${current.id}:retry`, {}, (body, key) => api.retryRequest(current.id, body, key))
  if (result) open.value = result
}
async function retryOriginal() {
  const result = await retrying.retry()
  if (result) open.value = result as Receipt
}

function tone(state: Receipt['state']) {
  return state === 'applied' ? 'success' : state === 'failed' ? 'danger' : 'warning'
}
</script>

<template>
  <MeLayout
    :title="t('me.requests')"
    :description="t('me.requestsIntro')"
  >
    <div class="stack-lg">
      <PagedState
        :status="receipts.status.value"
        :error="receipts.error.value"
        :count="receipts.items.value.length"
        :next="receipts.next.value"
        :appending="receipts.appending.value"
        :empty-text="t('me.requestsEmpty')"
        @retry="receipts.reload"
        @more="receipts.loadMore"
      >
        <ul class="list">
          <li
            v-for="item in receipts.items.value"
            :key="item.id"
            class="card row-between"
          >
            <div class="stack-sm">
              <strong>{{ t(`resources.request.kinds.${item.kind ?? 'complaint'}`) }}</strong>
              <span class="subtle">{{ format.dateTime(item.created_at) }}</span>
            </div>
            <div class="row">
              <StatusTag :tone="tone(item.state)">
                {{ t(`resources.request.state.${item.state}`) }}
              </StatusTag>
              <button
                class="btn btn-sm"
                type="button"
                @click="show(item.id)"
              >
                {{ t('me.checkStatus') }}
              </button>
            </div>
          </li>
        </ul>
      </PagedState>

      <p
        v-if="openError"
        class="notice notice-error"
        role="alert"
      >
        {{ errorText(openError) }}
      </p>
      <section
        v-if="open"
        class="card stack"
        aria-live="polite"
      >
        <div class="row-between">
          <h2>{{ t(`resources.request.kinds.${open.kind ?? 'complaint'}`) }}</h2>
          <StatusTag :tone="tone(open.state)">
            {{ t(`resources.request.state.${open.state}`) }}
          </StatusTag>
        </div>
        <p class="small muted">
          {{ t(`resources.request.stateHint.${open.state}`) }}
        </p>
        <p
          v-if="open.decision_reason"
          class="notice notice-info"
        >
          {{ t('me.decisionReason', { reason: open.decision_reason }) }}
        </p>
        <MutationNotice
          :busy="retrying.busy.value"
          :error="retrying.error.value"
          :uncertain="retrying.uncertain.value"
          @retry="retryOriginal"
        />
        <div class="row">
          <RouterLink
            v-if="open.resource_id"
            class="btn btn-sm btn-ghost"
            :to="`/resources/items/${encodeURIComponent(open.resource_id)}`"
          >
            {{ t('me.viewContent') }}
          </RouterLink>
          <button
            v-if="open.state === 'failed'"
            class="btn btn-sm"
            type="button"
            :disabled="retrying.busy.value || retrying.uncertain.value"
            @click="retry"
          >
            {{ t('me.retryRequest') }}
          </button>
          <button
            v-if="open.can_appeal && open.resource_id && open.task_id"
            class="btn btn-sm"
            type="button"
            @click="appealing = !appealing"
          >
            {{ t('me.appeal') }}
          </button>
        </div>
        <RequestForm
          v-if="appealing && open.resource_id && open.task_id"
          :key="open.id"
          :resource-id="open.resource_id"
          :previous-task-id="open.task_id"
          @saved="appealing = false; receipts.reload()"
        />
      </section>
    </div>
  </MeLayout>
</template>
