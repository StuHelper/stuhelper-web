<script setup lang="ts">
import AppSelect from '../../shared/ui/AppSelect.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMutation } from '../../shared/composables/async'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import { useResourcesApi, type Receipt, type RequestInput } from './api'

// Withdrawal requests (owner), infringement complaints (anyone) and appeals of
// a previous decision. Submitting a request never changes the resource itself.
const props = withDefaults(defineProps<{ resourceId: string; owned?: boolean; previousTaskId?: string }>(), { owned: false, previousTaskId: undefined })
const emit = defineEmits<{ saved: [receipt: Receipt] }>()
const { t } = useI18n()
const api = useResourcesApi()
const write = useMutation()
const kind = ref<RequestInput['kind']>(props.previousTaskId ? 'appeal' : props.owned ? 'withdrawal' : 'complaint')
const reason = ref('')
const contact = ref('')
const evidence = ref('')
const receipt = ref<Receipt>()
const complaint = computed(() => kind.value === 'complaint')
const locked = computed(() => write.busy.value || write.uncertain.value || !!receipt.value)

async function submit() {
  const body: RequestInput = {
    kind: kind.value,
    reason: reason.value.trim(),
    ...(contact.value.trim() ? { contact: contact.value.trim() } : {}),
    evidence: evidence.value.split('\n').map((line) => line.trim()).filter(Boolean),
    ...(props.previousTaskId ? { previous_task_id: props.previousTaskId } : {}),
  }
  const result = await write.run(`request:${props.resourceId}:${kind.value}`, body, (value, key) => api.createRequest(props.resourceId, value, key))
  if (result) {
    receipt.value = result
    emit('saved', result)
  }
}
async function retry() {
  const result = await write.retry()
  if (result) {
    // The retried request returns the original receipt.
    receipt.value = result as Receipt
    emit('saved', receipt.value)
  }
}
</script>

<template>
  <form
    class="stack"
    @submit.prevent="submit"
  >
    <h2>{{ t(previousTaskId ? 'resources.request.appealTitle' : 'resources.request.title') }}</h2>
    <fieldset
      class="stack"
      :disabled="locked"
    >
      <label
        v-if="!previousTaskId"
        class="field"
      >
        <span class="field-label">{{ t('resources.request.kind') }}</span>
        <AppSelect
          v-model="kind"
          class="select"
        >
          <option
            v-if="owned"
            value="withdrawal"
          >{{ t('resources.request.kinds.withdrawal') }}</option>
          <option value="complaint">{{ t('resources.request.kinds.complaint') }}</option>
        </AppSelect>
      </label>
      <p class="small muted">
        {{ t(`resources.request.hints.${kind}`) }}
      </p>
      <label class="field">
        <span class="field-label">{{ t('resources.request.reason') }}</span>
        <textarea
          v-model="reason"
          class="textarea"
          required
          maxlength="2000"
        />
      </label>
      <label class="field">
        <span class="field-label">{{ t('resources.request.contact') }}</span>
        <input
          v-model="contact"
          class="input"
          :required="complaint"
          maxlength="500"
        >
      </label>
      <div class="field">
        <label class="field">
          <span class="field-label">{{ t('resources.request.evidence') }}</span>
          <textarea
            v-model="evidence"
            class="textarea"
            :required="complaint"
            maxlength="8000"
          />
        </label>
        <span class="field-hint">{{ t('resources.request.evidenceHint') }}</span>
      </div>
    </fieldset>
    <MutationNotice
      :busy="write.busy.value"
      :error="write.error.value"
      :uncertain="write.uncertain.value"
      :success="receipt ? t('resources.request.received') : ''"
      @retry="retry"
    />
    <div
      v-if="!receipt"
      class="form-actions"
    >
      <button
        class="btn btn-primary"
        type="submit"
        :disabled="locked || !reason.trim()"
      >
        {{ t('common.submit') }}
      </button>
    </div>
  </form>
</template>
