<script setup lang="ts">
import { ArrowRight, BookOpen, Bookmark, CalendarClock, FileText, Flame, FolderOpen, GraduationCap, MapPin, PenLine, Scale, ShieldCheck, Sparkles } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { myCoursesEnabled, teacherDirectoryEnabled } from '../../app/features'
import { useFormat } from '../../app/i18n'
import { feature, useCapabilities, useLinkAvailable } from '../../shared/capabilities'
import { useAsync } from '../../shared/composables/async'
import { withFilters } from '../../shared/pageFilters'
import { recentPages } from '../../shared/recent'
import { useSession } from '../../shared/session'
import PageSkeleton from '../../shared/ui/PageSkeleton.vue'
import SearchField from '../../shared/ui/SearchField.vue'
import { useAccess, useCampusId } from '../account/access'
import AccessPanel from '../account/AccessPanel.vue'
import { knownCredits, useAcademic } from '../academic/api'
import { levelKeys, recommendationLevel } from '../academic/ratings/levels'
import RatingLevel from '../academic/ratings/RatingLevel.vue'
import { useNotificationsApi } from '../notifications/api'
import { localName, useResourcesApi } from '../resources/api'

// Signed-out and not yet verified visitors see what the site offers and how to get in.
// Verified users see a daily workspace: next class day, to-dos, popular courses, new
// resources and recently viewed pages. Every block loads on its own, so one failing
// source hides only that block.
const { t, locale } = useI18n()
const format = useFormat()
const router = useRouter()
const access = useAccess()
const session = useSession()
const campus = useCampusId()
const api = useAcademic()
const resources = useResourcesApi()
const notifications = useNotificationsApi()
const available = useLinkAvailable()
const verified = computed(() => access.state.value === 'verified')
const query = ref('')
const recent = ref(recentPages().slice(0, 4))

const greeting = computed(() => {
  const name = session.session.value?.profile?.nickname || t('browse.studentFallback')
  const hour = new Date().getHours()
  return t(hour < 6 ? 'browse.lateNight' : hour < 12 ? 'browse.goodMorning' : hour < 18 ? 'browse.goodAfternoon' : 'browse.goodEvening', { name })
})
const shortcuts = [
  { to: '/courses', title: 'nav.courses', icon: BookOpen, tile: 'var(--c-blue)' },
  ...(teacherDirectoryEnabled ? [{ to: '/teachers', title: 'nav.teachers', icon: GraduationCap, tile: 'var(--c-purple)' }] : []),
  { to: '/resources', title: 'nav.resources', icon: FolderOpen, tile: 'var(--c-orange)' },
  { to: '/compare', title: 'search.compare.title', icon: Scale, tile: 'var(--c-indigo)' },
  { to: '/me/favorites', title: 'browse.favorites', icon: Bookmark, tile: 'var(--c-pink)' },
] as const
const introductions = [
  { title: 'home.entries.courses.title', text: 'home.entries.courses.text', icon: BookOpen, tile: 'var(--c-blue)' },
  { title: 'home.entries.resources.title', text: 'home.entries.resources.text', icon: FolderOpen, tile: 'var(--c-orange)' },
  { title: 'home.entries.verification.title', text: 'home.entries.verification.text', icon: ShieldCheck, tile: 'var(--c-green)' },
] as const

// The next class day reads the viewer's enrollments, which stay off until the viewer
// grants that read. The server also answers "unavailable" in that case.
const classDay = useAsync((signal) => (myCoursesEnabled ? api.nextClassDay(signal) : Promise.resolve(undefined)))
const overview = useAsync((signal) => api.overview(signal))
const latestDraft = useAsync(async (signal) => (await api.myDrafts({ limit: 1 }, signal))[0])
const unread = useAsync((signal) => notifications.unread(signal))
const hot = useAsync(async (signal) => (await api.directory({ kind: 'course', school_id: campus.value, sort: 'hot', limit: 5 }, signal)).items)
const fresh = useAsync(async (signal) => (await resources.list({ school_id: campus.value, sort: 'newest', limit: 4 }, signal)).items.slice(0, 4))
// Notifications are an optional module; the unread count is read only when it runs.
const capabilities = useCapabilities()
const known = computed(() => capabilities.status.value === 'ready' || capabilities.status.value === 'error')
watch(() => [verified.value, known.value] as const, ([value, ready]) => {
  if (!value || !ready) return
  for (const part of [classDay, overview, latestDraft, hot, fresh]) void part.reload()
  if (capabilities.has(feature.notifications)) void unread.reload()
}, { immediate: true })

const showClassDay = computed(() => myCoursesEnabled && classDay.data.value?.state === 'available' && classDay.data.value.items.length > 0)
const pending = computed(() => (overview.data.value?.pending_courses.state === 'available' ? overview.data.value.pending_courses : undefined))
const unreadCount = computed(() => unread.data.value ?? 0)
const hasTodos = computed(() => !!pending.value?.count || !!overview.data.value?.draft_count || unreadCount.value > 0)
const timeOf = (iso: string) => format.value.dateTime(iso, { hour: '2-digit', minute: '2-digit' })
const tints = ['var(--c-blue)', 'var(--c-orange)', 'var(--c-purple)', 'var(--c-green)', 'var(--c-pink)']
function ago(iso?: string) {
  if (!iso) return ''
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 6e4)
  if (!Number.isFinite(minutes)) return ''
  if (minutes < 60) return format.value.relative(-Math.max(minutes, 1), 'minute')
  const hours = Math.round(minutes / 60)
  if (hours < 24) return format.value.relative(-hours, 'hour')
  const days = Math.round(hours / 24)
  return days < 30 ? format.value.relative(-days, 'day') : format.value.relative(-Math.round(days / 30), 'month')
}
const hotDetail = (row: NonNullable<typeof hot.data.value>[number]) => {
  const credits = knownCredits(row.object)
  const difficulty = row.dimensions[2]?.level ?? 0
  return [credits === undefined ? '' : t('academic.subject.credits', { credits: format.value.number(credits) }), difficulty ? t('browse.difficultyIs', { level: t(levelKeys.difficulty[difficulty]!) }) : ''].filter(Boolean).join(' · ')
}
const kindLabel = (kind: string) => t(kind === 'course' ? 'nav.courses' : kind === 'teacher' ? 'nav.teachers' : 'browse.resourcesShort')
function search() {
  const q = query.value.trim()
  void router.push(q ? withFilters('/courses', { q }) : '/courses')
}
</script>

<template>
  <PageSkeleton
    v-if="access.state.value === 'loading'"
    variant="home"
  />
  <div
    v-else-if="!verified"
    class="stack-lg"
  >
    <section class="hero">
      <p class="eyebrow">
        {{ t('home.eyebrow') }}
      </p>
      <h1>{{ t('home.title') }}</h1>
      <p class="lead">
        {{ t('home.description') }}
      </p>
    </section>
    <AccessPanel />
    <ul class="intro">
      <li
        v-for="item in introductions"
        :key="item.title"
        class="card"
      >
        <span
          class="icon-tile"
          :style="{ '--tile': item.tile }"
        ><component
          :is="item.icon"
          aria-hidden="true"
        /></span>
        <h2 class="d-title">
          {{ t(item.title) }}
        </h2>
        <p class="muted small">
          {{ t(item.text) }}
        </p>
      </li>
    </ul>
  </div>

  <div
    v-else
    class="stack-lg"
  >
    <header class="top">
      <h1 class="hello">
        {{ greeting }}
      </h1>
      <form
        class="home-search"
        role="search"
        @submit.prevent="search"
      >
        <SearchField
          v-model="query"
          :aria-label="t('browse.searchHomeLabel')"
          :placeholder="t('browse.searchHomeHint')"
        />
      </form>
    </header>

    <nav
      class="shortcuts"
      :aria-label="t('browse.shortcuts')"
    >
      <RouterLink
        v-for="s in shortcuts.filter((entry) => available(entry.to))"
        :key="s.to"
        :to="s.to"
        class="shortcut"
      >
        <span
          class="icon-tile"
          :style="{ '--tile': s.tile }"
        ><component
          :is="s.icon"
          aria-hidden="true"
        /></span>{{ t(s.title) }}
      </RouterLink>
    </nav>

    <div class="d-grid">
      <section
        v-if="showClassDay && classDay.data.value"
        class="card d-span-7 stack"
        style="order: 1"
        aria-labelledby="h-day"
      >
        <div class="row-between">
          <h2
            id="h-day"
            class="d-title row"
          >
            <CalendarClock
              class="day-icon"
              aria-hidden="true"
            />{{ t('browse.nextClassDay') }}
          </h2>
          <RouterLink
            class="small"
            to="/me/courses"
          >
            {{ t('browse.fullTimetable') }}
          </RouterLink>
        </div>
        <ol class="timeline">
          <li
            v-for="(row, i) in classDay.data.value.items"
            :key="row.course_id + row.starts_at"
          >
            <RouterLink
              :to="`/courses/${encodeURIComponent(row.course_id)}`"
              class="lesson"
              :style="{ '--c': tints[i % tints.length] }"
            >
              <span class="time">{{ row.start_period ? t('browse.periods', { p0: format.number(row.start_period), p1: format.number(row.end_period) }) : timeOf(row.starts_at) }}</span>
              <span class="group-body"><b>{{ row.course_name }}</b><span class="subtle row"><MapPin
                class="pin"
                aria-hidden="true"
              />{{ [row.location, ...row.teachers.map((p) => p.name)].filter(Boolean).join(' · ') }}</span></span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <section
        class="d-span-7 stack"
        :style="{ order: showClassDay ? 3 : 1 }"
        aria-labelledby="h-hot"
      >
        <div class="row-between">
          <h2
            id="h-hot"
            class="d-title row"
          >
            <Flame
              class="flame"
              aria-hidden="true"
            />{{ t('browse.studentsWatching') }}
          </h2>
          <RouterLink
            class="small"
            to="/courses"
          >
            {{ t('browse.allCourses') }}
          </RouterLink>
        </div>
        <ol
          v-if="hot.data.value?.length"
          class="group"
        >
          <li
            v-for="(row, i) in hot.data.value"
            :key="row.object.id"
          >
            <RouterLink
              class="group-row"
              :to="`/courses/${encodeURIComponent(row.object.id)}`"
            >
              <span
                class="rank"
                :class="{ top: i < 3 }"
              >{{ format.number(i + 1) }}</span>
              <span class="group-body"><span class="group-title truncate">{{ row.object.name }}</span><span class="subtle">{{ hotDetail(row) }}</span></span>
              <RatingLevel :level="recommendationLevel[row.recommendation]" />
            </RouterLink>
          </li>
        </ol>
        <p
          v-else-if="hot.status.value === 'error'"
          class="muted small"
        >
          {{ t('browse.blockUnavailable') }}
        </p>
      </section>

      <section
        class="card d-span-5 stack"
        style="order: 2"
        aria-labelledby="h-todo"
      >
        <h2
          id="h-todo"
          class="d-title"
        >
          {{ t('browse.todo') }}
        </h2>
        <RouterLink
          v-if="pending?.count"
          class="todo"
          :to="pending.items[0] ? `/courses/${encodeURIComponent(pending.items[0].course_id)}` : '/me/reviews'"
        >
          <span
            class="icon-tile"
            style="--tile:var(--c-indigo)"
          ><PenLine aria-hidden="true" /></span>
          <span class="group-body"><b>{{ t('browse.pendingReviews', { count: format.number(pending.count) }) }}</b><span class="subtle">{{ t('browse.lastTermDoneHint') }}</span></span><ArrowRight
            class="chevron flip-rtl"
            aria-hidden="true"
          />
        </RouterLink>
        <RouterLink
          v-if="overview.data.value?.draft_count"
          class="todo"
          to="/me/reviews?tab=drafts"
        >
          <span
            class="icon-tile"
            style="--tile:var(--c-orange)"
          ><FileText aria-hidden="true" /></span>
          <span class="group-body"><b>{{ t('browse.draftsPending', { count: format.number(overview.data.value.draft_count) }) }}</b><span
            v-if="latestDraft.data.value"
            class="subtle truncate"
          >{{ latestDraft.data.value.input.title || t('academic.editor.untitled') }}</span></span><ArrowRight
            class="chevron flip-rtl"
            aria-hidden="true"
          />
        </RouterLink>
        <RouterLink
          v-if="unreadCount"
          class="todo"
          to="/notifications"
        >
          <span
            class="icon-tile"
            style="--tile:var(--c-green)"
          ><Sparkles aria-hidden="true" /></span>
          <span class="group-body"><b>{{ t('browse.unreadNotices', { count: format.number(unreadCount) }) }}</b></span><ArrowRight
            class="chevron flip-rtl"
            aria-hidden="true"
          />
        </RouterLink>
        <p
          v-if="!hasTodos && overview.status.value !== 'loading'"
          class="muted small"
        >
          {{ overview.status.value === 'error' ? t('browse.blockUnavailable') : t('browse.noTodos') }}
        </p>
      </section>

      <section
        class="stack"
        :class="recent.length || showClassDay ? 'd-span-5' : 'd-span-12'"
        style="order: 4"
        aria-labelledby="h-new"
      >
        <div class="row-between">
          <h2
            id="h-new"
            class="d-title"
          >
            {{ t('browse.newResources') }}
          </h2>
          <RouterLink
            class="small"
            to="/resources"
          >
            {{ t('browse.allResources') }}
          </RouterLink>
        </div>
        <ul
          v-if="fresh.data.value?.length"
          class="group"
        >
          <li
            v-for="row in fresh.data.value"
            :key="row.id"
          >
            <RouterLink
              class="group-row"
              :to="`/resources/items/${encodeURIComponent(row.id)}`"
            >
              <span class="group-body"><span class="group-title clamp-2">{{ row.current?.metadata.title }}</span><span class="subtle">{{ [localName(row.current?.category.names ?? {}, locale), ago(row.current?.created_at)].filter(Boolean).join(' · ') }}</span></span>
            </RouterLink>
          </li>
        </ul>
        <p
          v-else-if="fresh.status.value === 'ready'"
          class="muted small"
        >
          {{ t('resources.browse.empty') }}
        </p>
        <p
          v-else-if="fresh.status.value === 'error'"
          class="muted small"
        >
          {{ t('browse.blockUnavailable') }}
        </p>
      </section>

      <section
        v-if="recent.length"
        class="stack"
        :class="showClassDay ? 'd-span-12' : 'd-span-7'"
        style="order: 5"
        aria-labelledby="h-recent"
      >
        <h2
          id="h-recent"
          class="d-title"
        >
          {{ t('browse.recentlyViewed') }}
        </h2>
        <ul class="recent">
          <li
            v-for="row in recent"
            :key="row.path"
          >
            <RouterLink
              class="card card-link recent-card"
              :to="row.path"
            >
              <span class="card-title truncate">{{ row.title }}</span><span class="subtle">{{ kindLabel(row.kind) }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hero { display: grid; gap: .75rem; padding-block: clamp(1rem, 4vw, 3rem) 0; }
.eyebrow { color: var(--accent); font-weight: 600; }
.hero h1 { font-size: clamp(2.25rem, 1.5rem + 3.4vw, 4rem); letter-spacing: -.03em; }
.lead { max-width: 36rem; color: var(--label-2); font-size: clamp(1.0625rem, 1rem + .4vw, 1.3125rem); line-height: 1.45; }
.intro { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
.intro li { display: grid; gap: .5rem; align-content: start; }
.d-grid > section { align-content: start; }
.top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .875rem 2rem; }
.hello { font-size: clamp(1.625rem, 1.3rem + 1.4vw, 2.25rem); }
.home-search { display: flex; flex: 0 1 26rem; }
.shortcuts { display: flex; gap: .5rem; overflow-x: auto; margin-block-start: calc(-1 * clamp(.75rem, 2vw, 1.5rem)); scrollbar-width: none; }
.shortcut { display: inline-flex; flex: none; align-items: center; gap: .5rem; padding: .375rem .875rem .375rem .375rem; border-radius: var(--pill); background: var(--surface); box-shadow: var(--shadow-card); color: var(--label); font-size: .875rem; font-weight: 500; transition: transform .35s var(--spring); }
.shortcut:hover { text-decoration: none; transform: translateY(-1px); }
.shortcut .icon-tile { width: 26px; height: 26px; border-radius: 50%; }
.shortcut .icon-tile svg { width: 15px; height: 15px; }
.timeline { display: grid; gap: .5rem; }
.lesson { display: flex; align-items: center; gap: .875rem; padding: .625rem .875rem; border-inline-start: 4px solid var(--c); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--c) 9%, transparent); color: inherit; transition: transform .3s var(--spring); }
.lesson:hover { text-decoration: none; transform: translateX(2px); }
.lesson b { font-weight: 600; }
.time { flex: none; width: 5rem; color: var(--label-2); font-size: .8125rem; font-variant-numeric: tabular-nums; }
.pin { width: .8125rem; height: .8125rem; }
.day-icon { width: 1.125rem; height: 1.125rem; color: var(--c-red); }
.subtle.row { gap: .1875rem; }
.todo { display: flex; align-items: center; gap: .75rem; color: inherit; }
.todo:hover { text-decoration: none; }
.todo:hover b { color: var(--accent); }
.todo b { font-weight: 550; font-size: .9375rem; }
.flame { width: 1.125rem; height: 1.125rem; color: var(--c-flame); }
.clamp-2 { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.recent { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); }
.recent-card { padding: .875rem 1rem; }
.rank { flex: none; width: 1.25rem; color: var(--label-3); font-weight: 650; font-variant-numeric: tabular-nums; text-align: center; }
.rank.top { color: color-mix(in srgb, var(--c-flame) 72%, var(--label)); }
@media (max-width: 480px) { .time { width: 4.25rem; } }
</style>
