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
import HomepageMedia from './HomepageMedia.vue'
import HomepageText from './HomepageText.vue'
import TeacherComplaintForm from './TeacherComplaintForm.vue'
import { supervisorKey, textFields, useTeacherHomepage, type HomepageMedium, type HomepageProfile } from './teacherHomepage'

// The teacher's official homepage as the school allows it to be shown: facts, contact,
// biography, research and the homepage's own sections. Everything is plain text. The
// teacher (by an active teacher credential for this catalog entry) may ask for changes;
// any other signed-in reader may complain about the content.
const props = defineProps<{ teacherId: string }>()
const { t } = useI18n()
const api = useTeacherHomepage()
const verification = useVerification()
const session = useSession()

const revealContacts = ref(false)
const homepage = useAsync((signal) => api.homepage(props.teacherId, signal, revealContacts.value))
function showContacts() {
  revealContacts.value = true
  void homepage.reload()
}
// Wait for the reader's own credentials before offering either action.
const owner = useAsync(async (signal) => {
  if (session.state.value !== 'member') return false
  const credentials = await verificationPages((after) => verification.list('TeacherCredential', '/api/v1/verification/teacher-credentials', { limit: 100, after, signal }))
  return credentials.items.some((item) => item.state === 'active' && item.teacher_ids.includes(props.teacherId))
})
// Body media load on their own: a failure leaves the text of the page in place.
const media = useAsync((signal) => api.media(props.teacherId, signal))
let refreshedAfterImageDenial = false
watch(() => props.teacherId, () => {
  refreshedAfterImageDenial = false
  revealContacts.value = false
  void homepage.reload()
  void owner.reload()
  void media.reload()
}, { immediate: true })
// An image can disappear because its entire source section was withdrawn.
function mediaGone() {
  if (refreshedAfterImageDenial) return
  refreshedAfterImageDenial = true
  void homepage.reload()
  void media.reload()
}
const profile = computed<HomepageProfile | undefined>(() => homepage.data.value?.profile)
const mediaOf = (field: 'biography' | 'research') => (media.data.value ?? []).filter((item) => item.field === field)
const sections = computed(() => {
  const groups = new Map<string, HomepageMedium[]>()
  for (const item of media.data.value ?? []) {
    if (item.field !== 'sections') continue
    const title = item.section ?? ''
    const group = groups.get(title)
    if (group) group.push(item)
    else groups.set(title, [item])
  }
  // The contract identifies a section by title. Keep repeated text sections,
  // attach the group once, then append media-only sections in source order.
  const rows = (profile.value?.sections ?? []).map(({ title, text }) => {
    const items = groups.get(title) ?? []
    groups.delete(title)
    return { title, text, media: items }
  })
  for (const [title, items] of groups) rows.push({ title, text: '', media: items })
  return rows
})

// Short facts in a definition list; long texts and sections follow as paragraphs.
const shortFacts = ['position', 'education', 'degree', 'discipline', 'email', 'phone', 'office_location', 'hire_date'] as const
const facts = computed(() => {
  const value = profile.value
  if (!value) return []
  return shortFacts.filter((key) => value[key]).map((key) => ({ key, text: value[key] as string }))
})
const hasContent = computed(() => {
  if (homepage.status.value !== 'ready') return false
  if (media.data.value?.length || homepage.data.value?.contacts_available) return true
  const value = profile.value
  return !!value && (textFields.some((key) => value[key]) || value.supervisors.length > 0 || value.fields.length > 0 || value.sections.length > 0 || !!value.photo)
})
const mediaFailed = computed(() => homepage.status.value === 'ready' && media.status.value === 'error')

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
    v-if="homepage.status.value === 'error' || hasContent || mediaFailed || owner.data.value"
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
      v-else-if="!hasContent && !mediaFailed"
      class="muted small"
    >
      {{ t('teacherHomepage.empty') }}
    </p>
    <article
      v-else-if="hasContent"
      class="card stack homepage"
    >
      <div
        v-if="profile"
        class="homepage-head"
      >
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
        v-for="part in (['biography', 'research'] as const)"
        v-show="profile?.[part] || mediaOf(part).length"
        :key="part"
        class="stack-sm"
      >
        <h3>{{ t(`teacherHomepage.fields.${part}`) }}</h3>
        <p
          v-if="profile?.[part]"
          class="prewrap"
        >
          <HomepageText :text="profile[part]" />
        </p>
        <HomepageMedia
          :items="mediaOf(part)"
          @gone="mediaGone"
        />
      </div>
      <dl
        v-if="profile?.fields.length"
        class="facts"
      >
        <div
          v-for="(item, index) in profile.fields"
          :key="`${index}:${item.label}`"
        >
          <dt>{{ item.label }}</dt>
          <dd class="prewrap">
            <HomepageText :text="item.value || t('common.notProvided')" />
          </dd>
        </div>
      </dl>
      <details
        v-for="(item, index) in sections"
        :key="`${index}:${item.title}`"
        class="homepage-section"
      >
        <summary>{{ item.title || t('teacherHomepage.media.untitled') }}</summary>
        <p
          v-if="item.text"
          class="prewrap"
        >
          <HomepageText :text="item.text" />
        </p>
        <HomepageMedia
          :items="item.media"
          @gone="mediaGone"
        />
      </details>
      <button
        v-if="homepage.data.value?.contacts_available"
        class="btn btn-sm"
        type="button"
        @click="showContacts"
      >{{ t('teacherHomepage.showContacts') }}</button>
      <p class="subtle small">
        {{ t('teacherHomepage.source') }}
      </p>
    </article>
    <div
      v-if="mediaFailed"
      class="notice notice-error"
      role="alert"
    >
      <span>{{ t('teacherHomepage.media.loadFailed') }}</span>
      <button
        type="button"
        class="btn btn-sm"
        @click="media.reload()"
      >
        {{ t('common.retry') }}
      </button>
    </div>

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
