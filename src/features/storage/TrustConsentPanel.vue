<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { components } from '../../api/storage.gen'
import contract from '../../../contracts/storage.openapi.json'
import { schemaOf } from '../../shared/api/schema'
import { errorCode, isUncertain } from '../../shared/api/errors'
import { useHttp } from '../../shared/session'
import { useErrorText } from '../../shared/ui/messages'
import { localDateInput } from './conditions'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const http = useHttp()
const errorText = useErrorText()
type State = components['schemas']['TrustState']
type Decision = components['schemas']['TrustConsentRequest']
const parse = schemaOf<State>(contract.components.schemas, 'TrustState')
const url = () => `/api/v1/storage/instances/${encodeURIComponent(props.id)}/trust-consent`
const options = ['quarantine', 'restricted'] as const
const state = ref<State>()
const scope = ref('')
const until = ref('')
const classes = ref<Decision['classes']>([])
const confirmed = ref(false)
const error = ref('')
const open = ref(false)
const busy = ref(false)
const pending = ref<{ body: Decision; key: string }>()
let current: AbortController | undefined

function apply(next: State) {
  state.value = next
  scope.value = next.consent?.scope ?? next.available_scopes[0] ?? ''
  until.value = localDateInput(Date.parse(next.consent?.until ?? next.maximum_until)).slice(0, 16)
  classes.value = [...(next.consent?.classes ?? [])]
  confirmed.value = false
}
async function request(write = false) {
  current?.abort()
  const controller = new AbortController()
  current = controller
  busy.value = true
  error.value = ''
  const attempt = write ? pending.value : undefined
  try {
    const next = await http.json(url(), parse, {
      method: attempt ? 'PUT' : 'GET', body: attempt?.body, key: attempt?.key, signal: controller.signal,
    })
    if (current !== controller) return
    apply(next)
    pending.value = undefined
  } catch (failure) {
    if (current !== controller || controller.signal.aborted) return
    error.value = errorCode(failure)
    if (!isUncertain(failure)) pending.value = undefined
    if (['forbidden', 'unauthenticated'].includes(error.value)) {
      state.value = undefined
      classes.value = []
      pending.value = undefined
    }
  } finally {
    if (current === controller) busy.value = false
  }
}
function toggle() {
  open.value = !open.value
  if (open.value && !pending.value) void request()
}
function save(withdraw: boolean) {
  const row = state.value
  if (!row || busy.value || pending.value) return
  const time = Date.parse(until.value)
  if (!scope.value || (!withdraw && (!confirmed.value || !classes.value.length || !Number.isFinite(time)))) return
  pending.value = {
    key: crypto.randomUUID(),
    body: { revision: row.revision, scope: scope.value, classes: withdraw ? [] : [...classes.value],
      until: withdraw ? row.maximum_until : new Date(time).toISOString() },
  }
  void request(true)
}
onBeforeUnmount(() => { current?.abort(); current = undefined })
</script>

<template>
  <section class="stack-sm">
    <button
      class="btn btn-sm"
      type="button"
      :aria-expanded="open"
      @click="toggle"
    >
      {{ t('custody.trust.title') }}
    </button>
    <div
      v-if="open"
      class="stack-sm"
    >
      <p
        v-if="error"
        class="notice notice-error"
        role="alert"
      >
        {{ errorText(error) }}
      </p>
      <button
        v-if="error"
        class="btn btn-sm"
        type="button"
        :disabled="busy"
        @click="request(!!pending)"
      >
        {{ t('common.retry') }}
      </button>
      <form
        v-if="state"
        class="stack-sm"
        @submit.prevent="save(false)"
      >
        <p>{{ t('custody.trust.explanation') }}</p>
        <p role="status">
          {{ t(state.trusted ? 'custody.trust.active' : 'custody.trust.inactive') }}
        </p>
        <fieldset
          class="stack-sm"
          :disabled="busy || !!pending"
        >
          <legend>{{ t('custody.trust.categories') }}</legend>
          <label
            v-for="option in options"
            :key="option"
            class="check"
          >
            <input
              v-model="classes"
              type="checkbox"
              :value="option"
            >
            <span>{{ t(`custody.trust.${option}`) }}</span>
          </label>
          <label>{{ t('custody.trust.scope') }}
            <select
              v-model="scope"
              required
            ><option
              v-for="item in state.available_scopes"
              :key="item"
              :value="item"
            >{{ item }}</option></select>
          </label>
          <label>{{ t('custody.trust.until') }}
            <input
              v-model="until"
              type="datetime-local"
              :max="localDateInput(Date.parse(state.maximum_until)).slice(0, 16)"
              required
            >
          </label>
          <label class="check"><input
            v-model="confirmed"
            type="checkbox"
            required
          ><span>{{ t('custody.trust.agree') }}</span></label>
          <button
            class="btn btn-sm"
            type="submit"
            :disabled="!confirmed || !scope || !classes.length"
          >
            {{ t('custody.trust.save') }}
          </button>
          <button
            v-if="state.consent"
            class="btn btn-sm"
            type="button"
            @click="save(true)"
          >
            {{ t('custody.trust.withdraw') }}
          </button>
        </fieldset>
      </form>
    </div>
  </section>
</template>
