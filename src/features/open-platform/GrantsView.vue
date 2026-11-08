<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { usePaged, useMutation } from '../../shared/composables/async'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import PagedState from '../../shared/ui/PagedState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../../shared/ui/toast'
import MeLayout from '../account/MeLayout.vue'
import { usePlatformApi, type Grant, type Scope } from './api'

// Applications the person authorized. Withdrawing some scopes keeps the rest;
// withdrawing all ends the grant. Withdrawal affects only this application's
// access to StuHelper information, not any account the person holds elsewhere.
const { t } = useI18n()
const format = useFormat()
const api = usePlatformApi()
const grants = usePaged<Grant>((after, signal) => api.grants(after, signal))
void grants.reload()
const active = computed(() => grants.items.value.filter((grant) => grant.state === 'active' && grant.scopes.length > 0))

const target = shallowRef<Grant>()
const chosen = ref<Scope[]>([])
const write = useMutation()
function open(grant: Grant) {
  target.value = grant
  chosen.value = [...grant.scopes]
}
async function revoke() {
  const grant = target.value
  if (!grant || !chosen.value.length) return
  const result = await write.run(`revoke:${grant.id}:${chosen.value.join(',')}`, { revision: grant.revision, scopes: chosen.value.slice() }, (body, key) => api.revoke(grant.id, body, key))
  if (result) done(result)
}
async function retry() {
  const result = await write.retry()
  // The retried request is the original withdrawal and returns the same Grant.
  if (result) done(result as Grant)
}
function done(result: Grant) {
  grants.items.value = grants.items.value.map((grant) => (grant.id === result.id ? result : grant))
  toast(t(result.state === 'revoked' || !result.scopes.length ? 'platform.grants.revokedAll' : 'platform.grants.revokedSome', { name: result.app_name }))
  target.value = undefined
}
function close() {
  if (!write.busy.value && !write.uncertain.value) target.value = undefined
}
</script>

<template>
  <MeLayout
    :title="t('platform.grants.title')"
    :description="t('platform.grants.description')"
  >
    <PagedState
      :status="grants.status.value"
      :error="grants.error.value"
      :count="active.length"
      :next="grants.next.value"
      :appending="grants.appending.value"
      :empty-text="t('platform.grants.empty')"
      @retry="grants.reload"
      @more="grants.loadMore"
    >
      <ul class="list">
        <li
          v-for="grant in active"
          :key="grant.id"
          class="card stack"
        >
          <div class="row nowrap">
            <span
              class="logo"
              aria-hidden="true"
            >{{ [...grant.app_name][0] ?? '?' }}</span>
            <div class="group-body">
              <b>{{ grant.app_name }}</b>
              <span class="subtle">{{ t('platform.grants.expires', { date: format.dateTime(grant.expires_at) }) }}</span>
            </div>
            <button
              class="btn btn-sm btn-danger"
              type="button"
              @click="open(grant)"
            >
              {{ t('platform.grants.revoke') }}
            </button>
          </div>
          <ul
            class="row"
            :aria-label="t('platform.grants.scopes')"
          >
            <li
              v-for="scope in grant.scopes"
              :key="scope"
              class="tag"
            >
              {{ t(`platform.scopes.${scope}.title`) }}
            </li>
          </ul>
        </li>
      </ul>
    </PagedState>

    <SheetDialog
      :open="!!target"
      :title="t('platform.grants.revokeTitle', { name: target?.app_name ?? '' })"
      :description="t('platform.grants.revokeHint')"
      @close="close"
    >
      <fieldset
        v-if="target"
        class="stack-sm"
        :disabled="write.busy.value || write.uncertain.value"
      >
        <legend class="field-label">
          {{ t('platform.grants.revokeScopes') }}
        </legend>
        <label
          v-for="scope in target.scopes"
          :key="scope"
          class="check"
        >
          <input
            v-model="chosen"
            type="checkbox"
            :value="scope"
          >
          <span class="stack-xs">
            <span>{{ t(`platform.scopes.${scope}.title`) }}</span>
            <span class="subtle">{{ t(`platform.scopes.${scope}.detail`) }}</span>
          </span>
        </label>
      </fieldset>
      <p
        v-if="target && chosen.length === target.scopes.length"
        class="notice notice-warning small"
      >
        {{ t('platform.grants.revokeAllNotice') }}
      </p>
      <MutationNotice
        :busy="write.busy.value"
        :error="write.error.value"
        :uncertain="write.uncertain.value"
        @retry="retry"
      />
      <div class="form-actions">
        <button
          class="btn btn-danger"
          type="button"
          :disabled="!chosen.length || write.busy.value || write.uncertain.value"
          @click="revoke"
        >
          {{ t('platform.grants.revokeSubmit') }}
        </button>
        <button
          class="btn"
          type="button"
          :disabled="write.busy.value || write.uncertain.value"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
      </div>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.nowrap { flex-wrap: nowrap; gap: .75rem; }
.logo { display: grid; flex: none; place-items: center; width: 44px; height: 44px; border-radius: 11px; background: linear-gradient(145deg, #5e9cff, var(--c-blue)); color: #fff; font-weight: 650; }
.check { display: flex; align-items: flex-start; gap: .5rem; }
.check input { margin-block-start: .25rem; }
.stack-xs { display: grid; gap: .125rem; }
</style>
