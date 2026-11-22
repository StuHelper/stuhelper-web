<script setup lang="ts">
import { Flag, Globe2, PenLine } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { useAsync } from '../../shared/composables/async'
import { useSession } from '../../shared/session'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { useVerification, verificationPages } from '../verification/api'
import TeacherComplaintForm from './TeacherComplaintForm.vue'
import { supervisorKey, textFields, useTeacherHomepage, type HomepageProfile } from './teacherHomepage'

// The teacher's official homepage as the school allows it to be shown: facts, contact,
// biography, research and the homepage's own sections. Everything is plain text. The
// teacher (by an active teacher credential for this catalog entry) may ask for changes;
// any other signed-in reader may complain about the content.
const props = defineProps<{ teacherId: string }>()
const { t } = useI18n()
const api = useTeacherHomepage()
const verification = useVerification()
const session = useSession()

const homepage = useAsync((signal) => api.homepage(props.teacherId, signal))
// Wait for the reader's own credentials before offering either action.
const owner = useAsync(async (signal) => {
  if (session.state.value !== 'member') return false
  const credentials = await verificationPages((after) => verification.list('TeacherCredential', '/api/v1/verification/teacher-credentials', { limit: 100, after, signal }))
  return credentials.items.some((item) => item.state === 'active' && item.teacher_ids.includes(props.teacherId))
})
watch(() => props.teacherId, () => { void homepage.reload(); void owner.reload() }, { immediate: true })

const profile = computed<HomepageProfile | undefined>(() => homepage.data.value?.profile)
// Short facts in a definition list; long texts and sections follow as paragraphs.
const shortFacts = ['position', 'education', 'degree', 'discipline', 'email', 'phone', 'office_location', 'hire_date'] as const
const facts = computed(() => {
  const value = profile.value
  if (!value) return []
  return shortFacts.filter((key) => value[key]).map((key) => ({ key, text: value[key] as string }))
})
const hasContent = computed(() => {
  const value = profile.value
  return !!value && (textFields.some((key) => value[key]) || value.supervisors.length > 0 || value.fields.length > 0 || value.sections.length > 0 || !!value.photo)
})

// The photo is read with the session and shown from a temporary object URL.
const photoUrl = ref('')
let photoRequest: AbortController | undefined
function releasePhoto() {
  photoRequest?.abort()
  photoRequest = undefined
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = ''
}
watch(() => profile.value?.photo?.url, async (url) => {
  releasePhoto()
  if (!url) return
  const controller = new AbortController()
  photoRequest = controller
  try {
    const blob = await api.photo(url, controller.signal)
    if (!controller.signal.aborted) photoUrl.value = URL.createObjectURL(blob)
  } catch {
    // A photo that cannot be read (withdrawn, expired) is simply left out.
  }
})
onBeforeUnmount(releasePhoto)

const complaining = ref(false)
</script>

<template>
  <section
    v-if="homepage.status.value === 'error' || hasContent || owner.data.value"
    class="section"
    aria-labelledby="teacher-homepage-title"
  >
    <div class="row-between">
      <h2
        id="teacher-homepage-title"
        class="d-title"
      >
        <Globe2 aria-hidden="true" />{{ t('teacherHomepage.title') }}
      </h2>
      <div class="row">
        <RouterLink
          v-if="owner.data.value"
          class="btn btn-sm"
          :to="`/me/teacher-homepage/${encodeURIComponent(teacherId)}`"
        >
          <PenLine aria-hidden="true" />{{ t('teacherHomepage.manage') }}
        </RouterLink>
        <button
          v-else-if="hasContent && owner.data.value === false && session.state.value === 'member'"
          class="btn btn-sm btn-ghost"
          type="button"
          @click="complaining = true"
        >
          <Flag aria-hidden="true" />{{ t('teacherHomepage.complain') }}
        </button>
        <ErrorNotice
          v-else-if="hasContent && owner.status.value === 'error'"
          :code="owner.error.value"
          @retry="owner.reload()"
        />
      </div>
    </div>
    <ErrorNotice
      v-if="homepage.status.value === 'error'"
      :code="homepage.error.value"
      @retry="homepage.reload()"
    />
    <p
      v-else-if="!hasContent"
      class="muted small"
    >
      {{ t('teacherHomepage.empty') }}
    </p>
    <article
      v-else-if="profile"
      class="card stack homepage"
    >
      <div class="homepage-head">
        <img
          v-if="photoUrl && profile.photo"
          class="homepage-photo"
          :src="photoUrl"
          :width="profile.photo.width"
          :height="profile.photo.height"
          :alt="t('teacherHomepage.photo', { name: profile.name ?? '' })"
        >
        <div class="stack-sm">
          <p
            v-if="profile.name"
            class="homepage-name"
          >
            {{ profile.name }}
          </p>
          <p
            v-if="profile.supervisors.length"
            class="row"
          >
            <span
              v-for="item in profile.supervisors"
              :key="item"
              class="tag"
            >{{ t(`teacherHomepage.supervisors.${supervisorKey(item)}`) }}</span>
          </p>
          <dl
            v-if="facts.length"
            class="facts"
          >
            <div
              v-for="fact in facts"
              :key="fact.key"
            >
              <dt>{{ t(`teacherHomepage.fields.${fact.key}`) }}</dt>
              <dd class="prewrap">
                {{ fact.text }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div
        v-if="profile.biography"
        class="stack-sm"
      >
        <h3>{{ t('teacherHomepage.fields.biography') }}</h3>
        <p class="prewrap">
          {{ profile.biography }}
        </p>
      </div>
      <div
        v-if="profile.research"
        class="stack-sm"
      >
        <h3>{{ t('teacherHomepage.fields.research') }}</h3>
        <p class="prewrap">
          {{ profile.research }}
        </p>
      </div>
      <dl
        v-if="profile.fields.length"
        class="facts"
      >
        <div
          v-for="(item, index) in profile.fields"
          :key="`${index}:${item.label}`"
        >
          <dt>{{ item.label }}</dt>
          <dd class="prewrap">
            {{ item.value || t('common.notProvided') }}
          </dd>
        </div>
      </dl>
      <details
        v-for="(item, index) in profile.sections"
        :key="`${index}:${item.title}`"
        class="homepage-section"
      >
        <summary>{{ item.title }}</summary>
        <p class="prewrap">
          {{ item.text }}
        </p>
      </details>
      <p class="subtle small">
        {{ t('teacherHomepage.source') }}
      </p>
    </article>

    <SheetDialog
      :open="complaining"
      :title="t('teacherHomepage.complaint.title')"
      :description="t('teacherHomepage.complaint.description')"
      @close="complaining = false"
    >
      <TeacherComplaintForm
        :teacher-id="teacherId"
        @done="complaining = false"
      />
    </SheetDialog>
  </section>
</template>

<style scoped>
.d-title { display: flex; align-items: center; gap: .5rem; }
.d-title svg { width: 20px; height: 20px; color: var(--accent); }
.homepage-head { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; }
.homepage-photo { flex: none; width: 112px; height: auto; max-height: 150px; object-fit: cover; border-radius: var(--radius); background: var(--fill); }
.homepage-name { font-size: 1.125rem; font-weight: 620; }
.homepage .facts { grid-template-columns: repeat(auto-fill, minmax(min(100%, 12rem), 1fr)); }
.homepage-section { border-block-start: 1px solid var(--separator); padding-block-start: .75rem; }
.homepage-section summary { cursor: pointer; font-weight: 600; }
.homepage-section p { margin-block-start: .5rem; }
.homepage h3 { font-size: 1rem; font-weight: 600; }
</style>
