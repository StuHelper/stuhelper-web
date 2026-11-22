<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { useMutation } from '../../shared/composables/async'
import MutationNotice from '../../shared/ui/MutationNotice.vue'
import ViolationSelect from '../moderation/ViolationSelect.vue'
import type { ViolationCategory } from '../moderation/categories'
import { useTeacherHomepage, type Complaint } from './teacherHomepage'

// A reader's complaint about a teacher homepage. It goes to the school's moderators, who
// may hide the homepage; the catalog entry and its reviews stay. Limits are counted in
// code points, as the server counts them.
const props = defineProps<{ teacherId: string }>()
const emit = defineEmits<{ done: [] }>()
const { t } = useI18n()
const format = useFormat()
const api = useTeacherHomepage()
const write = useMutation()
const category = ref<ViolationCategory | ''>('')
const reason = ref('')
const evidence = ref('')
const sent = ref(false)
const length = (text: string) => [...text].length
const lines = computed(() => evidence.value.split('\n').map((line) => line.trim()).filter(Boolean))
const reasonTooLong = computed(() => length(reason.value) > 2000)
const evidenceInvalid = computed(() => lines.value.length > 5 || lines.value.some((line) => length(line) > 2000))
const ready = computed(() => !!category.value && !!reason.value.trim() && !reasonTooLong.value && !evidenceInvalid.value)
const locked = computed(() => write.busy.value || write.uncertain.value || sent.value)

async function submit() {
  if (!ready.value || !category.value) return
  const body: Complaint = { category: category.value, reason: reason.value.trim(), evidence: lines.value }
  if (await write.run(`teacher-homepage-complaint:${props.teacherId}`, body, (value, key) => api.complain(props.teacherId, value, key))) sent.value = true
}
async function retry() {
  if (await write.retry()) sent.value = true
}
</script>

<template>
  <form
    class="stack"
    @submit.prevent="submit"
  >
    <ViolationSelect
      v-model="category"
      :disabled="locked"
    />
    <label>{{ t('teacherHomepage.complaint.reason') }}
      <textarea
        v-model="reason"
        rows="4"
        required
        :disabled="locked"
        :aria-invalid="reasonTooLong"
      />
      <span
        class="small"
        :class="reasonTooLong ? 'field-error' : 'subtle'"
      >{{ t('teacherHomepage.limit', { count: format.number(length(reason)), max: format.number(2000) }) }}</span>
    </label>
    <label>{{ t('teacherHomepage.complaint.evidence') }}
      <textarea
        v-model="evidence"
        rows="3"
        :disabled="locked"
        :aria-invalid="evidenceInvalid"
      />
      <span
        class="small"
        :class="evidenceInvalid ? 'field-error' : 'subtle'"
      >{{ t('teacherHomepage.complaint.evidenceHint') }}</span>
    </label>
    <p class="subtle small">
      {{ t('teacherHomepage.complaint.email', { email: 'legal@stuhelper.com' }) }}
    </p>
    <MutationNotice
      :busy="write.busy.value"
      :error="write.error.value"
      :uncertain="write.uncertain.value"
      :success="sent ? t('teacherHomepage.complaint.sent') : ''"
      @retry="retry"
    />
    <div class="form-actions">
      <button
        v-if="sent"
        class="btn"
        type="button"
        @click="emit('done')"
      >
        {{ t('common.close') }}
      </button>
      <button
        v-else
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
/* Labels stack their field and hint, so the text areas use the full dialog width. */
label { display: grid; gap: .375rem; }
textarea { inline-size: 100%; }
</style>
