<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useLeaveGuard } from '../../shared/composables/leave'
import { useAsync, useMutation } from '../../shared/composables/async'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import { useClosureApi, type Closure } from './closure'

// Closing the StuHelper account: request with an explicit acknowledgement, then follow the
// server's progress. Used on the security page and on the terms consent page, because a person
// who declines updated terms may still close the account.
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const closures = useClosureApi()
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
const closureWrite = useMutation()
useLeaveGuard(() => closureWrite.uncertain.value ? t('common.leaveUncertain') : closureWrite.busy.value ? t('common.leaveUnsaved') : '')
const working = closureWrite.busy
async function requestClosure() {
  if (!acknowledged.value || phrase.value.trim() !== confirmPhrase.value || working.value) return
  const result = closureWrite.uncertain.value ? await closureWrite.retry() : await closureWrite.run('closure', {}, (_, key) => closures.request(key))
  if (!result) { toast(errorText(closureWrite.error.value)); return }
  closure.data.value = result as Closure
  requestOpen.value = false
  acknowledged.value = false
  phrase.value = ''
  toast(t('security.closure.requested'))
}
const cancelOpen = ref(false)
async function cancelClosure(value: Closure) {
  const result = closureWrite.uncertain.value ? await closureWrite.retry() : await closureWrite.run(`cancel:${value.id}`, { id: value.id }, (body, key) => closures.cancel(body.id, key))
  if (!result) { toast(errorText(closureWrite.error.value)); return }
  closure.data.value = result as Closure
  cancelOpen.value = false
  toast(t('security.closure.cancelled'))
}
const canCancel = (value: Closure) => value.state === 'cooling' && Date.parse(value.cooling_ends_at) > Date.now()
</script>

<template>
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
        v-if="active.blocker && !active.pending_reasons?.length"
        class="muted small"
      >
        {{ t(`security.closure.blockers.${active.blocker}`) }}
      </p>
      <ul
        v-if="active.pending_reasons?.length"
        class="muted small"
      >
        <li
          v-for="reason in active.pending_reasons"
          :key="reason"
        >
          {{ t(`security.closure.reasons.${reason}`) }}
        </li>
      </ul>
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
    :open="cancelOpen"
    :title="t('security.closure.cancel')"
    :message="t('security.closure.cancelConfirm')"
    :confirm-label="t('security.closure.cancel')"
    :busy="working"
    @confirm="active && cancelClosure(active)"
    @cancel="!working && !closureWrite.uncertain.value && (cancelOpen = false)"
  />
  <SheetDialog
    :open="requestOpen"
    :title="t('security.closure.request')"
    :description="t('security.closure.cooling')"
    @close="!working && !closureWrite.uncertain.value && (requestOpen = false)"
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
        :disabled="working || closureWrite.uncertain.value"
        @click="requestOpen = false"
      >
        {{ t('common.cancel') }}
      </button>
    </div>
  </SheetDialog>
</template>

<style scoped>
.grow { flex: 1 1 14rem; }
.terms { padding-inline-start: 1.25rem; list-style: disc; }
.check { display: flex; align-items: flex-start; gap: .5rem; font-size: .9375rem; }
.check input { margin-block-start: .25rem; }
</style>
