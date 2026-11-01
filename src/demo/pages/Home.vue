<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowRight, Bookmark, BookOpen, CalendarClock, FileText, Flame, FolderOpen, GraduationCap, MapPin, PenLine, Scale, Sparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { recentPages } from '../../shared/recent'
import AccessPanel from '../../features/account/AccessPanel.vue'
import PageSkeleton from '../../shared/ui/PageSkeleton.vue'
import SearchField from './SearchField.vue'
import { useAccess } from '../../features/account/access'
import { courseSeeds, resources } from '../data'
import { greeting, levelText, notices, relative, timetable } from '../store'
import Level from './Level.vue'
const { t: tr } = useI18n()

const access = useAccess()
const router = useRouter()
const verified = computed(() => access.state.value === 'verified')
const q = ref('')
const recent = recentPages().slice(0, 4)
const today = computed(() => { const day = new Date().getDay() || 7; const rows = timetable.filter((row) => row.day === day); return rows.length ? rows : timetable.filter((row) => row.day === 2) })
const dayLabel = computed(() => (timetable.some((row) => row.day === (new Date().getDay() || 7)) ? tr('demo.todayClasses') : tr('demo.nextClassDay')))
const hot = [...courseSeeds].sort((a, b) => b[7] - a[7]).slice(0, 5)
const fresh = resources.filter((row) => row.current && !row.owned).slice(0, 4)
const shortcuts = [
  { to: '/courses', text: tr('demo.courses'), icon: BookOpen, tile: 'var(--c-blue)' }, { to: '/teachers', text: tr('demo.teachers'), icon: GraduationCap, tile: 'var(--c-purple)' },
  { to: '/resources', text: tr('demo.resources'), icon: FolderOpen, tile: 'var(--c-orange)' }, { to: '/compare', text: tr('demo.compare'), icon: Scale, tile: 'var(--c-indigo)' }, { to: '/me/favorites', text: tr('demo.favorites'), icon: Bookmark, tile: 'var(--c-pink)' },
]
const intro = [
  { icon: BookOpen, tile: 'var(--c-blue)', title: tr('demo.featureReviewsTitle'), text: tr('demo.featureReviewsText') },
  { icon: FolderOpen, tile: 'var(--c-orange)', title: tr('demo.featureResourcesTitle'), text: tr('demo.featureResourcesText') },
  { icon: CalendarClock, tile: 'var(--c-red)', title: tr('demo.featureScheduleTitle'), text: tr('demo.featureScheduleText') },
]
const go = () => router.push({ path: '/courses', query: q.value.trim() ? { q: q.value.trim() } : {} })
</script>

<template>
  <PageSkeleton v-if="access.state.value === 'loading'" variant="home" />
  <div v-else-if="!verified" class="stack-lg">
    <section class="hero">
      <p class="eyebrow">{{ tr('demo.heroEyebrow') }}</p>
      <h1 style="white-space:pre-line">{{ tr('demo.heroTitle') }}</h1>
      <p class="lead">{{ tr('demo.heroLead') }}</p>
    </section>
    <AccessPanel />
    <ul class="intro">
      <li v-for="item in intro" :key="item.title" class="card">
        <span class="icon-tile" :style="{ '--tile': item.tile }"><component :is="item.icon" aria-hidden="true" /></span>
        <h2 class="d-title">{{ item.title }}</h2>
        <p class="muted small">{{ item.text }}</p>
      </li>
    </ul>
  </div>

  <div v-else class="stack-lg">
    <header class="top">
      <h1 class="hello">{{ greeting('小航同学') }}</h1>
      <form class="home-search" role="search" @submit.prevent="go"><SearchField v-model="q" :aria-label="tr('demo.searchHomeLabel')" :placeholder="tr('demo.searchHomeHint')" /></form>
    </header>

    <nav class="shortcuts" :aria-label="tr('demo.shortcuts')">
      <RouterLink v-for="s in shortcuts" :key="s.to" :to="s.to" class="shortcut">
        <span class="icon-tile" :style="{ '--tile': s.tile }"><component :is="s.icon" aria-hidden="true" /></span>{{ s.text }}
      </RouterLink>
    </nav>

    <div class="d-grid">
      <section class="card d-span-7 stack" aria-labelledby="h-today">
        <div class="row-between"><h2 id="h-today" class="d-title">{{ dayLabel }}</h2><RouterLink class="small" to="/me/courses">{{ tr('demo.fullTimetable') }}</RouterLink></div>
        <ol class="timeline">
          <li v-for="row in today" :key="row.name + row.start">
            <RouterLink :to="`/courses/${row.course}`" class="lesson" :style="{ '--c': row.color }">
              <span class="time">{{ tr('demo.periods', { p0: row.start, p1: row.end }) }}</span>
              <span class="group-body"><b>{{ row.name }}</b><span class="subtle row"><MapPin class="pin" aria-hidden="true" />{{ row.place }} · {{ row.teacher }}</span></span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <section class="card d-span-5 stack" aria-labelledby="h-todo">
        <h2 id="h-todo" class="d-title">{{ tr('demo.todo') }}</h2>
        <RouterLink class="todo" to="/courses/c2">
          <span class="icon-tile" style="--tile:var(--c-indigo)"><PenLine aria-hidden="true" /></span>
          <span class="group-body"><b>{{ tr('demo.reviewTodo') }}</b><span class="subtle">{{ tr('demo.lastTermDoneHint') }}</span></span><ArrowRight class="chevron" aria-hidden="true" />
        </RouterLink>
        <RouterLink class="todo" to="/me/reviews?tab=drafts">
          <span class="icon-tile" style="--tile:var(--c-orange)"><FileText aria-hidden="true" /></span>
          <span class="group-body"><b>{{ tr('demo.draftTodo') }}</b><span class="subtle">控制原理的学习建议</span></span><ArrowRight class="chevron" aria-hidden="true" />
        </RouterLink>
        <RouterLink class="todo" :to="notices[0]!.to">
          <span class="icon-tile" style="--tile:var(--c-green)"><Sparkles aria-hidden="true" /></span>
          <span class="group-body"><b>{{ notices[0]!.title }}</b><span class="subtle">{{ relative(notices[0]!.at) }}</span></span><ArrowRight class="chevron" aria-hidden="true" />
        </RouterLink>
      </section>

      <section class="d-span-7 stack" aria-labelledby="h-hot">
        <div class="row-between"><h2 id="h-hot" class="d-title row"><Flame class="flame" aria-hidden="true" />{{ tr('demo.studentsWatching') }}</h2><RouterLink class="small" to="/courses">{{ tr('demo.allCourses') }}</RouterLink></div>
        <ol class="group">
          <li v-for="(row, i) in hot" :key="row[0]">
            <RouterLink class="group-row" :to="`/courses/${row[0]}`">
              <span class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="group-body"><span class="group-title truncate">{{ row[1] }}</span><span class="subtle">{{ tr('demo.creditsDifficulty', { p0: row[6], p1: levelText.difficulty[row[8][2]!] }) }}</span></span>
              <Level dim="recommendation" :level="row[8][0]!" />
            </RouterLink>
          </li>
        </ol>
      </section>

      <section class="d-span-5 stack" aria-labelledby="h-new">
        <div class="row-between"><h2 id="h-new" class="d-title">{{ tr('demo.newResources') }}</h2><RouterLink class="small" to="/resources">{{ tr('demo.allResources') }}</RouterLink></div>
        <ul class="group">
          <li v-for="row in fresh" :key="row.id">
            <RouterLink class="group-row" :to="`/resources/items/${row.id}`">
              <span class="group-body"><span class="group-title clamp-2">{{ row.current!.metadata.title }}</span><span class="subtle">{{ row.current!.category.names['zh-CN'] }} · {{ relative(row.current!.created_at) }}</span></span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="recent.length" class="d-span-12 stack" aria-labelledby="h-recent">
        <h2 id="h-recent" class="d-title">{{ tr('demo.recentlyViewed') }}</h2>
        <ul class="recent">
          <li v-for="row in recent" :key="row.path"><RouterLink class="card card-link recent-card" :to="row.path"><span class="card-title truncate">{{ row.title }}</span><span class="subtle">{{ ({ course: tr('demo.courses'), teacher: tr('demo.teachers'), resource: tr('demo.resourcesShort') })[row.kind] }}</span></RouterLink></li>
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
.subtle.row { gap: .1875rem; }
.todo { display: flex; align-items: center; gap: .75rem; color: inherit; }
.todo:hover { text-decoration: none; }
.todo:hover b { color: var(--accent); }
.todo b { font-weight: 550; font-size: .9375rem; }
.flame { width: 1.125rem; height: 1.125rem; color: var(--c-flame); }
.recent { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); }
.recent-card { padding: .875rem 1rem; }
.rank { flex: none; width: 1.25rem; color: var(--label-3); font-weight: 650; font-variant-numeric: tabular-nums; text-align: center; }
.rank.top { color: color-mix(in srgb, var(--c-flame) 72%, var(--label)); }
@media (max-width: 480px) { .time { width: 4.25rem; } }
</style>
