<script setup lang="ts">
import PageSkeleton from '../../shared/ui/PageSkeleton.vue'
import { BookOpen, ChevronRight, FileText, FolderOpen, GraduationCap, Search, ShieldCheck, UserRound } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useFormat } from '../../app/i18n'
import { useAsync } from '../../shared/composables/async'
import { recentPages } from '../../shared/recent'
import { useAccess } from '../account/access'
import AccessPanel from '../account/AccessPanel.vue'
import { useAcademic, type CatalogObject } from '../academic/api'
import ConnectionStatus from '../platform/ConnectionStatus.vue'

// Signed-out and not yet verified visitors see what to do next. Verified users
// see a daily workspace: search, recent pages, courses, drafts and results.
const { t } = useI18n()
const format = useFormat()
const router = useRouter()
const access = useAccess()
const api = useAcademic()
const query = ref('')
const verified = computed(() => access.state.value === 'verified')
const recent = ref(recentPages())
const icons = { course: BookOpen, teacher: GraduationCap, resource: FolderOpen }
const shortcuts = [
  { to: '/courses', title: 'nav.courses', icon: BookOpen, tile: 'var(--c-blue)' },
  { to: '/teachers', title: 'nav.teachers', icon: GraduationCap, tile: 'var(--c-purple)' },
  { to: '/resources', title: 'nav.resources', icon: FolderOpen, tile: 'var(--c-orange)' },
  { to: '/me/reviews', title: 'me.reviews', icon: FileText, tile: 'var(--c-indigo)' },
  { to: '/me', title: 'me.title', icon: UserRound, tile: 'var(--c-pink)' },
] as const
const introductions = [
  { title: 'home.entries.courses.title', text: 'home.entries.courses.text', icon: BookOpen, tile: 'var(--c-blue)' },
  { title: 'home.entries.resources.title', text: 'home.entries.resources.text', icon: FolderOpen, tile: 'var(--c-orange)' },
  { title: 'home.entries.verification.title', text: 'home.entries.verification.text', icon: ShieldCheck, tile: 'var(--c-green)' },
] as const

// Sections fail independently, and one failure must not hide the others.
const workspace = useAsync(async (signal) => {
  const [courses, drafts, tasks] = await Promise.allSettled([
    api.myEnrollments({}, signal),
    api.myDrafts({ limit: 3 }, signal),
    api.myTasks({ limit: 3 }, signal),
  ])
  const active = courses.status === 'fulfilled' ? courses.value.filter((row) => row.active) : []
  const latestTerm = active.at(-1)?.term_id
  const current = active.filter((row) => row.term_id === latestTerm).slice(0, 4)
  const draftRows = drafts.status === 'fulfilled' ? drafts.value : []
  let names = new Map<string, CatalogObject>()
  try {
    names = await api.lookup([...current.map((row) => row.course_id), ...draftRows.map((row) => row.input.target_id)], signal)
  } catch {
    // Rows below fall back to an unknown name.
  }
  return { courses: current, drafts: draftRows, tasks: tasks.status === 'fulfilled' ? tasks.value : [], names, failed: [courses, drafts, tasks].some((row) => row.status === 'rejected') }
})
watch(verified, (value) => {
  if (value) void workspace.reload()
}, { immediate: true })

function search(kind: 'courses' | 'teachers') {
  const q = query.value.trim()
  void router.push({ path: `/${kind}`, query: q ? { q } : {} })
}
const name = (id: string) => workspace.data.value?.names.get(id)?.name ?? t('common.unknown')
</script>

<template>
  <div
    class="home"
  >
    <PageSkeleton
      v-if="access.state.value === 'loading'"
      variant="home"
    />
    <section
      v-else-if="!verified"
      class="hero"
    >
      <p class="hero-eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('home.title') }}</h1>
      <p class="hero-description">
        {{ t('home.description') }}
      </p>
    </section>
    <h1
      v-else
      class="visually-hidden"
    >
      {{ t('home.title') }}
    </h1>

    <AccessPanel v-if="!verified" />

    <form
      v-if="verified"
      class="home-search"
      role="search"
      @submit.prevent="search('courses')"
    >
      <label
        class="visually-hidden"
        for="home-search"
      >{{ t('home.searchLabel') }}</label>
      <div class="home-field">
        <Search aria-hidden="true" />
        <input
          id="home-search"
          v-model="query"
          type="search"
          maxlength="200"
          :placeholder="t('home.searchPlaceholder')"
        >
      </div>
      <button
        class="btn btn-primary"
        type="submit"
      >
        {{ t('home.searchCourses') }}
      </button>
      <button
        class="btn"
        type="button"
        @click="search('teachers')"
      >
        {{ t('home.searchTeachers') }}
      </button>
    </form>

    <template v-if="verified">
      <nav
        class="shortcuts"
        :aria-label="t('home.entriesTitle')"
      >
        <RouterLink
          v-for="item in shortcuts"
          :key="item.to"
          class="shortcut"
          :to="item.to"
        >
          <span
            class="icon-tile"
            :style="{ '--tile': item.tile }"
          ><component
            :is="item.icon"
            aria-hidden="true"
          /></span>
          <span class="shortcut-label">{{ t(item.title) }}</span>
        </RouterLink>
      </nav>

      <div
        v-if="workspace.data.value?.failed || workspace.status.value === 'error'"
        class="notice notice-warning"
        role="alert"
      >
        <span>{{ t('home.workspaceFailed') }}</span>
        <button
          class="btn btn-sm"
          type="button"
          @click="workspace.reload"
        >
          {{ t('home.workspaceRetry') }}
        </button>
      </div>

      <div class="columns">
        <section class="section">
          <div class="section-head">
            <h2>{{ t('home.myCourses') }}</h2>
            <RouterLink to="/me/courses">
              {{ t('home.viewAll') }}
            </RouterLink>
          </div>
          <ul
            v-if="workspace.data.value?.courses.length"
            class="group"
          >
            <li
              v-for="row in workspace.data.value.courses"
              :key="row.id"
            >
              <RouterLink
                class="group-row"
                :to="`/courses/${encodeURIComponent(row.course_id)}`"
              >
                <span class="group-body group-title">{{ name(row.course_id) }}</span>
                <ChevronRight
                  class="chevron"
                  aria-hidden="true"
                />
              </RouterLink>
            </li>
          </ul>
          <p
            v-else-if="workspace.status.value === 'ready'"
            class="card empty-card muted small"
          >
            {{ t('home.noCourses') }}
          </p>
        </section>

        <section
          v-if="recent.length"
          class="section"
        >
          <h2>{{ t('home.recent') }}</h2>
          <ul class="group">
            <li
              v-for="row in recent"
              :key="row.path"
            >
              <RouterLink
                class="group-row"
                :to="row.path"
              >
                <component
                  :is="icons[row.kind]"
                  class="recent-icon"
                  aria-hidden="true"
                />
                <span class="group-body group-title truncate">{{ row.title }}</span>
                <ChevronRight
                  class="chevron"
                  aria-hidden="true"
                />
              </RouterLink>
            </li>
          </ul>
        </section>

        <section
          v-if="workspace.data.value?.drafts.length"
          class="section"
        >
          <div class="section-head">
            <h2>{{ t('me.reviewTabs.drafts') }}</h2>
            <RouterLink to="/me/reviews?tab=drafts">
              {{ t('home.viewAll') }}
            </RouterLink>
          </div>
          <ul class="group">
            <li
              v-for="row in workspace.data.value.drafts"
              :key="row.id"
            >
              <RouterLink
                class="group-row"
                to="/me/reviews?tab=drafts"
              >
                <span class="group-body">
                  <span class="group-title">{{ row.input.title || t('academic.editor.untitled') }}</span>
                  <span class="group-detail">{{ name(row.input.target_id) }}</span>
                </span>
                <ChevronRight
                  class="chevron"
                  aria-hidden="true"
                />
              </RouterLink>
            </li>
          </ul>
        </section>

        <section
          v-if="workspace.data.value?.tasks.length"
          class="section"
        >
          <div class="section-head">
            <h2>{{ t('home.results') }}</h2>
            <RouterLink to="/me/reviews?tab=requests">
              {{ t('home.viewAll') }}
            </RouterLink>
          </div>
          <ul class="group">
            <li
              v-for="row in workspace.data.value.tasks"
              :key="row.id"
            >
              <RouterLink
                class="group-row"
                to="/me/reviews?tab=requests"
              >
                <span class="group-body">
                  <span class="group-title">{{ t(`academic.taskKind.${row.submission.kind}`) }}</span>
                  <span class="group-detail">{{ format.dateTime(row.updated_at) }}</span>
                </span>
                <ChevronRight
                  class="chevron"
                  aria-hidden="true"
                />
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>
    </template>

    <ul
      v-else
      class="intro"
    >
      <li
        v-for="item in introductions"
        :key="item.title"
      >
        <span
          class="icon-tile"
          :style="{ '--tile': item.tile }"
        ><component
          :is="item.icon"
          aria-hidden="true"
        /></span>
        <h2 class="intro-title">
          {{ t(item.title) }}
        </h2>
        <p class="muted small">
          {{ t(item.text) }}
        </p>
      </li>
    </ul>

    <ConnectionStatus />
  </div>
</template>

<style scoped>
.home { display: grid; gap: clamp(1.5rem, 3.5vw, 2.5rem); }
.hero { display: grid; gap: .5rem; max-width: 42rem; }
.hero-eyebrow { color: var(--accent); font-size: .9375rem; font-weight: 600; }
.hero h1 { font-size: clamp(2rem, 1.6rem + 2vw, 3rem); }
.hero-description { color: var(--label-2); font-size: clamp(1.0625rem, 1rem + .3vw, 1.25rem); line-height: 1.4; }
.home-search { display: flex; flex-wrap: wrap; gap: .5rem; }
.home-field { position: relative; display: flex; flex: 1 1 18rem; align-items: center; }
.home-field svg { position: absolute; inset-inline-start: 1rem; width: 1.125rem; height: 1.125rem; color: var(--label-3); pointer-events: none; }
.home-field input { width: 100%; height: 44px; padding-inline: 2.75rem 1rem; border: 0; border-radius: var(--pill); background: var(--surface); box-shadow: var(--shadow-card); color: var(--label); font: inherit; letter-spacing: inherit; }
.home-field input:focus { outline: none; box-shadow: 0 0 0 1.5px var(--accent-fill), 0 0 0 5px var(--accent-soft); }
.shortcuts { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: .5rem; }
.shortcut { display: grid; justify-items: center; gap: .375rem; padding: .75rem .25rem; border-radius: var(--radius); color: var(--label); font-size: .8125rem; text-align: center; transition: background-color .15s; }
.shortcut:hover { background: var(--fill); text-decoration: none; }
.shortcut .icon-tile { width: 40px; height: 40px; border-radius: 11px; }
.shortcut .icon-tile svg { width: 22px; height: 22px; }
.columns { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); align-items: start; }
.columns h2 { font-size: 1.1875rem; }
.empty-card { padding: 1rem 1.125rem; }
.recent-icon { flex: none; width: 1.125rem; height: 1.125rem; color: var(--label-3); }
.intro { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); }
.intro li { display: grid; justify-items: start; align-content: start; gap: .375rem; }
.intro-title { font-size: 1.0625rem; }
.home > .connection, .home :deep(.connection) { justify-content: flex-start; }
</style>
