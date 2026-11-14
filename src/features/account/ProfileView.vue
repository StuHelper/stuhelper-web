<script setup lang="ts">
import { Eye } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import sessionContract from '../../../contracts/session.openapi.json'
import type { components } from '../../api/session.gen'
import { errorCode } from '../../shared/api/errors'
import { segment } from '../../shared/api/http'
import { schemaOf } from '../../shared/api/schema'
import { useAsync } from '../../shared/composables/async'
import { useLeaveGuard } from '../../shared/composables/leave'
import { useHttp, useSession, type Profile } from '../../shared/session'
import AsyncState from '../../shared/ui/AsyncState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import MeLayout from './MeLayout.vue'
import { feature, useCapabilities } from '../../shared/capabilities'

const capabilities = useCapabilities()

// The owner's profile: nickname, bio and which academic facts the public profile shows.
// Lengths count Unicode code points, as the server does.
type PublicProfile = components['schemas']['PublicProfile']
type Visibility = Profile['visibility']
type CardConsent = Profile['group_card_consent']
const parsePublic = schemaOf<PublicProfile>(sessionContract.components.schemas, 'PublicProfile')

const { t } = useI18n()
const errorText = useErrorText()
const session = useSession()
const http = useHttp()

const profile = useAsync((signal) => session.currentProfile(signal))
void profile.reload()
const form = reactive({ nickname: '', bio: '', visibility: { school: true, badge: true, department: true, grade: false, reviews: true, resources: true } as Visibility, card: { school: false, grade: false, department: false, name: false, student_id: false, gender: false, nickname: false } as CardConsent })
const baseline = ref('')
const snapshot = () => JSON.stringify(form)
watch(() => profile.data.value, (value) => {
  if (!value) return
  Object.assign(form, { nickname: value.nickname, bio: value.bio, visibility: { ...value.visibility }, card: { ...value.group_card_consent } })
  baseline.value = snapshot()
}, { immediate: true })
const dirty = computed(() => !!baseline.value && snapshot() !== baseline.value)
const points = (value: string) => [...value].length
const nickname = computed(() => form.nickname.trim())
const nicknameError = computed(() => (!nickname.value ? t('profile.nicknameRequired') : points(nickname.value) > 20 ? t('profile.tooLong', { max: 20 }) : ''))
const bioError = computed(() => (points(form.bio) > 120 ? t('profile.tooLong', { max: 120 }) : ''))
const saving = ref(false)
const saveError = ref('')
useLeaveGuard(() => (dirty.value || saving.value ? t('common.leaveUnsaved') : ''))

const switches: (keyof Visibility)[] = ['school', 'badge', 'department', 'grade', 'reviews', 'resources']
// Fields a QQ group may put on the member's group card. Each is off until the owner allows it.
const cardFields: (keyof CardConsent)[] = ['nickname', 'name', 'school', 'department', 'grade', 'student_id', 'gender']

async function save() {
  const current = profile.data.value
  if (!current || nicknameError.value || bioError.value || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    profile.data.value = await session.saveProfile({ nickname: nickname.value, bio: form.bio.trim(), visibility: { ...form.visibility }, group_card_consent: { ...(capabilities.has(feature.groups) ? form.card : current.group_card_consent) }, revision: current.revision }, crypto.randomUUID())
    toast(t('profile.saved'))
  } catch (failure) {
    // A newer revision saved elsewhere keeps the typed values so they can be saved again after reloading.
    saveError.value = errorCode(failure) === 'conflict' ? t('profile.conflict') : errorText(errorCode(failure))
  } finally {
    saving.value = false
  }
}
async function reloadKeepingInput() {
  const typed = JSON.parse(snapshot()) as typeof form
  await profile.reload()
  Object.assign(form, typed)
  saveError.value = ''
}

// The preview shows the saved public profile exactly as other people receive it.
const previewOpen = ref(false)
const preview = useAsync((signal) => http.json(`/api/v1/profiles/${segment(profile.data.value!.id)}`, parsePublic, { signal }))
function openPreview() {
  previewOpen.value = true
  void preview.reload()
}
const facts = (row: PublicProfile['affiliations'][number]) => [row.school_name, row.department, row.grade].filter(Boolean).join(' · ')
</script>

<template>
  <MeLayout
    :title="t('profile.title')"
    :description="t('profile.description')"
  >
    <AsyncState
      :status="profile.status.value"
      :error="profile.error.value"
      @retry="profile.reload()"
    >
      <form
        class="stack-lg"
        novalidate
        @submit.prevent="save"
      >
        <section class="card stack">
          <div class="row avatar-row">
            <span
              class="avatar"
              aria-hidden="true"
            >{{ [...nickname][0] ?? '?' }}</span>
            <div class="row-between grow">
              <p class="subtle">
                {{ dirty ? t('profile.previewSavedOnly') : t('profile.previewHint') }}
              </p>
              <button
                class="btn btn-sm"
                type="button"
                :disabled="!profile.data.value?.nickname"
                @click="openPreview"
              >
                <Eye aria-hidden="true" />{{ t('profile.preview') }}
              </button>
            </div>
          </div>
          <div class="field">
            <label
              class="field-label"
              for="profile-nickname"
            >{{ t('profile.nickname') }}</label>
            <input
              id="profile-nickname"
              v-model="form.nickname"
              class="input"
              autocomplete="nickname"
              :aria-invalid="!!nicknameError"
              aria-describedby="profile-nickname-hint"
            >
            <span
              id="profile-nickname-hint"
              :class="nicknameError ? 'field-error' : 'field-hint'"
            >{{ nicknameError || `${points(nickname)}/20` }}</span>
          </div>
          <div class="field">
            <label
              class="field-label"
              for="profile-bio"
            >{{ t('profile.bio') }}</label>
            <textarea
              id="profile-bio"
              v-model="form.bio"
              class="textarea"
              :aria-invalid="!!bioError"
              aria-describedby="profile-bio-hint"
            />
            <span
              id="profile-bio-hint"
              :class="bioError ? 'field-error' : 'field-hint'"
            >{{ bioError || `${points(form.bio)}/120` }}</span>
          </div>
        </section>
        <section
          class="section"
          aria-labelledby="profile-public"
        >
          <h2
            id="profile-public"
            class="d-title"
          >
            {{ t('profile.publicShows') }}
          </h2>
          <p class="muted small">
            {{ t('profile.publicHint') }}
          </p>
          <div class="card stack">
            <label
              v-for="key in switches"
              :key="key"
              class="check switch"
            >
              <input
                v-model="form.visibility[key]"
                type="checkbox"
              >
              <span>{{ t(`profile.visibility.${key}`) }}</span>
            </label>
          </div>
        </section>
        <section
          v-if="capabilities.has(feature.groups)"
          class="section"
          aria-labelledby="profile-card"
        >
          <h2
            id="profile-card"
            class="d-title"
          >
            {{ t('profile.card.title') }}
          </h2>
          <p class="muted small">
            {{ t('profile.card.hint') }}
          </p>
          <div class="card stack">
            <label
              v-for="key in cardFields"
              :key="key"
              class="check switch"
            >
              <input
                v-model="form.card[key]"
                type="checkbox"
              >
              <span>{{ t(`profile.card.fields.${key}`) }}</span>
            </label>
          </div>
        </section>
        <div
          v-if="saveError"
          class="notice notice-warning row-between"
          role="alert"
        >
          <span>{{ saveError }}</span>
          <button
            class="btn btn-sm"
            type="button"
            @click="reloadKeepingInput"
          >
            {{ t('profile.reload') }}
          </button>
        </div>
        <div class="form-actions save">
          <button
            class="btn btn-primary"
            type="submit"
            :disabled="!dirty || !!nicknameError || !!bioError || saving"
          >
            {{ t('profile.save') }}
          </button>
          <span
            v-if="dirty"
            class="subtle"
          >{{ t('profile.unsaved') }}</span>
        </div>
      </form>
    </AsyncState>

    <SheetDialog
      :open="previewOpen"
      :title="t('profile.previewTitle')"
      :description="t('profile.previewDescription')"
      @close="previewOpen = false"
    >
      <AsyncState
        :status="preview.status.value"
        :error="preview.error.value"
        @retry="preview.reload()"
      >
        <template v-if="preview.data.value">
          <div class="row avatar-row">
            <span
              class="avatar still"
              aria-hidden="true"
            >{{ [...preview.data.value.nickname][0] }}</span>
            <div class="group-body">
              <b>{{ preview.data.value.nickname }}</b>
              <span
                v-for="(row, index) in preview.data.value.affiliations"
                :key="index"
                class="subtle"
              >{{ facts(row) }}<template v-if="row.badge"> · {{ t(`profile.badge.${row.badge}`) }}</template></span>
            </div>
          </div>
          <p
            v-if="preview.data.value.bio"
            class="muted small prewrap"
          >
            {{ preview.data.value.bio }}
          </p>
          <p
            v-if="preview.data.value.facts_state === 'unavailable'"
            class="notice notice-info small"
          >
            {{ t('profile.factsUnavailable') }}
          </p>
        </template>
      </AsyncState>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.avatar-row { flex-wrap: nowrap; gap: 1rem; }
.grow { flex: 1; min-width: 0; }
.avatar { display: grid; flex: none; place-items: center; width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(145deg, #5e9cff, var(--c-blue)); color: #fff; font-size: 1.75rem; font-weight: 600; }
.avatar.still { width: 56px; height: 56px; font-size: 1.375rem; }
.check { display: flex; align-items: center; gap: .5rem; }
.save { position: sticky; inset-block-end: calc(var(--tab-height) + 1rem); }
@media (min-width: 761px) { .save { position: static; } }
</style>
