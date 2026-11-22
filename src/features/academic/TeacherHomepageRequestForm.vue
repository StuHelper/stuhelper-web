<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMutation } from '../../shared/composables/async'
import AppSelect from '../../shared/ui/AppSelect.vue'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import {
  base64Of, photoLimit, requestFields, supervisorKey, supervisorOptions, textLimit, useTeacherHomepage,
  type HomepageField, type HomepageRequest, type HomepageRequestInput, type HomepageRequestKind, type Supervisor,
} from './teacherHomepage'

// The teacher's own request to correct, add to or hide part of the homepage. The school
// reviews it; nothing changes on the page until it is approved. One field (or one labelled
// item of the general fields and sections) per request, as the server accepts.
const props = defineProps<{ teacherId: string }>()
const emit = defineEmits<{ saved: [request: HomepageRequest] }>()
const { t } = useI18n()
const api = useTeacherHomepage()
const write = useMutation()

const kind = ref<HomepageRequestKind>('correction')
const field = ref<HomepageField>('biography')
const label = ref('')
const text = ref('')
const supervisors = ref<Supervisor[]>([])
const message = ref('')
const photo = ref<File>()
const photoUrl = ref('')
const photoError = ref('')
const saved = ref<HomepageRequest>()

const length = (value: string) => [...value].length
// Only hiding applies to the whole page; a labelled item needs its label.
const fields = computed(() => requestFields.filter((value) => value !== 'page' || kind.value === 'hide'))
watch(kind, (value) => { if (value !== 'hide' && field.value === 'page') field.value = 'biography' })
const grouped = computed(() => field.value === 'fields' || field.value === 'sections')
const needsValue = computed(() => kind.value !== 'hide')
const limit = computed(() => textLimit(field.value, !!label.value.trim()))
const textInvalid = computed(() => length(text.value) > limit.value)
const messageInvalid = computed(() => length(message.value) > 2000)
const valueReady = computed(() => {
  if (!needsValue.value) return true
  if (field.value === 'photo') return !!photo.value && !photoError.value
  if (field.value === 'supervisors') return true
  return !!text.value.trim() && !textInvalid.value
})
// Correcting or adding a general field or section names the item by its label.
const labelReady = computed(() => !grouped.value || !needsValue.value || !!label.value.trim())
const ready = computed(() => valueReady.value && labelReady.value && !!message.value.trim() && !messageInvalid.value && length(label.value) <= 160)
const locked = computed(() => write.busy.value || write.uncertain.value || !!saved.value)

function releasePhoto() {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = ''
}
onBeforeUnmount(releasePhoto)
function pick(event: Event) {
  releasePhoto()
  photoError.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  photo.value = undefined
  if (!file) return
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') photoError.value = t('teacherHomepage.request.photoType')
  else if (file.size > photoLimit) photoError.value = t('teacherHomepage.request.photoSize')
  else {
    photo.value = file
    photoUrl.value = URL.createObjectURL(file)
  }
}

async function proposal(): Promise<HomepageRequestInput['value']> {
  if (!needsValue.value) return undefined
  if (field.value === 'photo' && photo.value) return { photo: { content_type: photo.value.type as 'image/jpeg' | 'image/png', data: await base64Of(photo.value) } }
  if (field.value === 'supervisors') return { supervisors: supervisors.value }
  return { text: text.value.trim() }
}

async function submit() {
  if (!ready.value || locked.value) return
  const selector = { field: field.value, ...(grouped.value && label.value.trim() ? { label: label.value.trim() } : {}) }
  const proposed = await proposal()
  const body: HomepageRequestInput = { kind: kind.value, field: selector, ...(proposed ? { value: proposed } : {}), message: message.value.trim() }
  const result = await write.run(`teacher-homepage-request:${props.teacherId}`, body, (input, key) => api.submitRequest(props.teacherId, input, key))
  if (result) done(result)
}
async function retry() {
  const result = await write.retry()
  if (result) done(result as HomepageRequest)
}
function done(result: HomepageRequest) {
  saved.value = result
  emit('saved', result)
}
</script>

<template>
  <form
    class="stack"
    @submit.prevent="submit"
  >
    <fieldset class="stack-sm">
      <legend>{{ t('teacherHomepage.request.kind') }}</legend>
      <label
        v-for="option in (['correction', 'supplement', 'hide'] as const)"
        :key="option"
        class="check"
      >
        <input
          v-model="kind"
          type="radio"
          name="teacher-homepage-kind"
          :value="option"
          :disabled="locked"
        >
        <span>{{ t(`teacherHomepage.request.kinds.${option}`) }}</span>
      </label>
    </fieldset>
    <label class="field">
      <span class="field-label">{{ t('teacherHomepage.request.field') }}</span>
      <AppSelect
        v-model="field"
        class="select"
        :disabled="locked"
      >
        <option
          v-for="value in fields"
          :key="value"
          :value="value"
        >
          {{ t(`teacherHomepage.fields.${value}`) }}
        </option>
      </AppSelect>
    </label>
    <label v-if="grouped">{{ t('teacherHomepage.request.label') }}
      <input
        v-model="label"
        type="text"
        maxlength="160"
        :required="needsValue"
        :disabled="locked"
      >
      <span class="subtle small">{{ t(needsValue ? 'teacherHomepage.request.labelHint' : 'teacherHomepage.request.labelOptional') }}</span>
    </label>
    <template v-if="needsValue">
      <fieldset
        v-if="field === 'supervisors'"
        class="stack-sm"
      >
        <legend>{{ t('teacherHomepage.fields.supervisors') }}</legend>
        <label
          v-for="option in supervisorOptions"
          :key="option"
          class="check"
        >
          <input
            v-model="supervisors"
            type="checkbox"
            :value="option"
            :disabled="locked"
          >
          <span>{{ t(`teacherHomepage.supervisors.${supervisorKey(option)}`) }}</span>
        </label>
        <span class="subtle small">{{ t('teacherHomepage.request.supervisorsHint') }}</span>
      </fieldset>
      <label v-else-if="field === 'photo'">{{ t('teacherHomepage.request.photo') }}
        <input
          type="file"
          accept="image/jpeg,image/png"
          :disabled="locked"
          @change="pick"
        >
        <span
          class="small"
          :class="photoError ? 'field-error' : 'subtle'"
          :role="photoError ? 'alert' : undefined"
        >{{ photoError || t('teacherHomepage.request.photoHint') }}</span>
        <img
          v-if="photoUrl"
          class="preview"
          :src="photoUrl"
          :alt="t('teacherHomepage.request.photoPreview')"
        >
      </label>
      <label v-else>{{ t('teacherHomepage.request.value') }}
        <textarea
          v-model="text"
          :rows="limit > 1024 ? 8 : 3"
          required
          :disabled="locked"
          :aria-invalid="textInvalid"
        />
        <span
          class="small"
          :class="textInvalid ? 'field-error' : 'subtle'"
        >{{ t('teacherHomepage.limit', { count: length(text), max: limit }) }}</span>
      </label>
    </template>
    <label>{{ t('teacherHomepage.request.message') }}
      <textarea
        v-model="message"
        rows="3"
        required
        :disabled="locked"
        :aria-invalid="messageInvalid"
      />
      <span
        class="small"
        :class="messageInvalid ? 'field-error' : 'subtle'"
      >{{ t('teacherHomepage.limit', { count: length(message), max: 2000 }) }}</span>
    </label>
    <MutationNotice
      :busy="write.busy.value"
      :error="write.error.value"
      :uncertain="write.uncertain.value"
      :success="saved ? t('teacherHomepage.request.sent') : ''"
      @retry="retry"
    />
    <div
      v-if="!saved"
      class="form-actions"
    >
      <button
        class="btn btn-primary"
        type="submit"
        :disabled="!ready || locked"
      >
        {{ t('common.submit') }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.preview { max-width: 160px; max-height: 200px; margin-block-start: .5rem; border-radius: var(--radius); object-fit: contain; }
</style>
