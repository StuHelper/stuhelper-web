<script setup lang="ts">
import { FileCheck2, LogOut } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { errorCode } from '../../shared/api/errors'
import { isolate } from '../../shared/format'
import { useAsync } from '../../shared/composables/async'
import { useSession, type LegalConsentDocument, type LegalConsentStatus, type LegalDocumentId } from '../../shared/session'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import { useErrorText } from '../../shared/ui/messages'
import { toast } from '../../shared/ui/toast'
import AccountClosure from './AccountClosure.vue'
import { safeNext } from './access'

// Before pages that need an account, the person accepts the current user agreement and privacy
// policy. Each document has its own box, never ticked in advance; the server records each
// acceptance with the exact version and digest shown here. A person who declines can still sign
// out or close the account, and public pages stay readable.
const props = withDefaults(defineProps<{ gate?: boolean }>(), { gate: false })
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const route = useRoute()
const router = useRouter()
const session = useSession()
const order: LegalDocumentId[] = ['terms', 'privacy']

const status = useAsync((signal) => session.consentStatus(signal))
void status.reload()

// The ticked boxes, kept per document version so an update clears only what changed.
const ticked = reactive<Record<LegalDocumentId, string>>({ terms: '', privacy: '' })
const identity = (document: LegalConsentDocument) => `${document.version}:${document.digest}`
const documents = computed(() => {
  const value = status.data.value
  return value ? order.map((id) => ({ id, document: value.documents[id] })) : []
})
const pending = computed(() => documents.value.filter((row) => row.document.required))
const returning = computed(() => documents.value.some((row) => row.document.receipt))
const ready = computed(() => pending.value.length > 0 && pending.value.every((row) => ticked[row.id] === identity(row.document)))
const sending = ref(false)
const changed = ref(false)
const failure = ref('')

function toggle(id: LegalDocumentId, document: LegalConsentDocument, value: boolean) {
  ticked[id] = value ? identity(document) : ''
}

// Leave the consent page once the full session is back.
watch(() => session.state.value, (state) => {
  if (state === 'member' && !props.gate && route.path === '/consent') void router.replace(safeNext(route.query.next) || '/')
})

function apply(next: LegalConsentStatus) {
  status.data.value = next
  // A box stays ticked only for the exact version and digest the person saw.
  for (const id of order) if (ticked[id] && ticked[id] !== identity(next.documents[id])) ticked[id] = ''
}

async function submit() {
  if (!ready.value || sending.value) return
  sending.value = true
  failure.value = ''
  changed.value = false
  try {
    let latest: LegalConsentStatus | undefined
    for (const row of pending.value) latest = await session.acceptDocument(row.id, row.document)
    if (latest) apply(latest)
    if (latest && !latest.required) {
      await session.reload()
      toast(t('consent.done'))
    }
  } catch (error) {
    const code = errorCode(error)
    if (code === 'consent_version_changed') {
      changed.value = true
      try { apply(await session.consentStatus()) } catch (reload) { failure.value = errorCode(reload) }
    } else failure.value = code
  } finally {
    sending.value = false
  }
}

const leaving = ref(false)
async function signOut() {
  if (leaving.value) return
  leaving.value = true
  try {
    await session.signOut(false)
  } catch (error) {
    toast(errorText(errorCode(error)))
    leaving.value = false
  }
}
</script>

<template>
  <div
    class="consent stack"
    :class="{ 'consent-gate': gate }"
  >
    <section
      class="card stack"
      aria-labelledby="consent-title"
    >
      <span
        class="consent-icon"
        aria-hidden="true"
      ><FileCheck2 /></span>
      <component
        :is="gate ? 'h1' : 'h2'"
        id="consent-title"
        class="consent-title"
      >
        {{ t('consent.title') }}
      </component>
      <p class="muted">
        {{ t(returning ? 'consent.updated' : 'consent.description') }}
      </p>
      <div
        v-if="status.status.value === 'loading'"
        class="skeleton"
      >
        <span aria-hidden="true" />
      </div>
      <ErrorNotice
        v-else-if="status.status.value === 'error'"
        :code="status.error.value"
        @retry="status.reload()"
      />
      <form
        v-else-if="status.data.value"
        class="stack"
        @submit.prevent="submit"
      >
        <ul class="consent-list">
          <li
            v-for="row in documents"
            :key="row.id"
            class="consent-item"
          >
            <label
              v-if="row.document.required"
              class="check"
            >
              <input
                type="checkbox"
                :checked="ticked[row.id] === identity(row.document)"
                :disabled="sending"
                @change="toggle(row.id, row.document, ($event.target as HTMLInputElement).checked)"
              >
              <span>{{ t('consent.agree', { name: t(`consent.documents.${row.id}`) }) }}</span>
            </label>
            <p
              v-else
              class="consent-done"
            >
              {{ t(`consent.documents.${row.id}`) }}
              <span class="muted small">{{ row.document.receipt ? t('consent.accepted', { date: format.dateTime(row.document.receipt.accepted_at) }) : '' }}</span>
            </p>
            <p class="small muted consent-meta">
              <span>{{ t('consent.version', { version: isolate(row.document.version) }) }}</span>
              <a
                :href="row.document.url"
                target="_blank"
                rel="noopener"
              >{{ t('consent.read', { name: t(`consent.documents.${row.id}`) }) }}</a>
            </p>
          </li>
        </ul>
        <p
          v-if="changed"
          class="notice notice-warning"
          role="alert"
        >
          {{ t('consent.changed') }}
        </p>
        <p
          v-if="failure"
          class="notice notice-error"
          role="alert"
        >
          {{ errorText(failure) }}
        </p>
        <div
          v-if="pending.length"
          class="form-actions"
        >
          <button
            class="btn btn-primary"
            type="submit"
            :disabled="!ready || sending"
          >
            {{ t(sending ? 'consent.sending' : 'consent.submit') }}
          </button>
        </div>
        <p
          v-else
          class="muted"
          role="status"
        >
          {{ t('consent.allAccepted') }}
        </p>
      </form>
    </section>
    <section
      v-if="session.state.value === 'consent'"
      class="card stack-sm"
      aria-labelledby="consent-decline"
    >
      <h2
        id="consent-decline"
        class="d-title"
      >
        {{ t('consent.declineTitle') }}
      </h2>
      <p class="muted small">
        {{ t('consent.decline') }}
      </p>
      <div class="row">
        <button
          class="btn btn-sm"
          type="button"
          :disabled="leaving"
          @click="signOut"
        >
          <LogOut aria-hidden="true" />{{ t('account.menu.signOut') }}
        </button>
      </div>
    </section>
    <AccountClosure v-if="session.state.value === 'consent'" />
  </div>
</template>

<style scoped>
.consent { max-width: 40rem; margin-inline: auto; }
.consent-gate { margin-block-start: clamp(1rem, 6vw, 3rem); }
.consent-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); }
.consent-icon svg { width: 24px; height: 24px; }
.consent-title { font-size: clamp(1.25rem, 1.1rem + .7vw, 1.625rem); font-weight: 650; }
.consent-list { display: grid; gap: 1rem; }
.consent-item { display: grid; gap: .375rem; }
.consent-meta { display: flex; flex-wrap: wrap; gap: .25rem 1rem; padding-inline-start: 2rem; }
.consent-done { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; font-weight: 550; }
</style>
