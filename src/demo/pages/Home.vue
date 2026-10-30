<script setup lang="ts">
import { ArrowRight, BookOpen, CalendarClock, FileText, Flame, FolderOpen, GraduationCap, HardDrive, MapPin, PenLine, Search, Sparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AccessPanel from '../../features/account/AccessPanel.vue'
import { useAccess } from '../../features/account/access'
import { courseSeeds, resources } from '../data'
import { greeting, levelText, notices, relative, timetable } from '../store'
import Level from './Level.vue'

const access = useAccess()
const router = useRouter()
const verified = computed(() => access.state.value === 'verified')
const q = ref('')
const today = computed(() => { const day = new Date().getDay() || 7; const rows = timetable.filter((row) => row.day === day); return rows.length ? rows : timetable.filter((row) => row.day === 2) })
const dayLabel = computed(() => (timetable.some((row) => row.day === (new Date().getDay() || 7)) ? '今天的课' : '下一个上课日'))
const hot = [...courseSeeds].sort((a, b) => b[7] - a[7]).slice(0, 5)
const fresh = resources.filter((row) => row.current && !row.owned).slice(0, 4)
const shortcuts = [
  { to: '/courses', text: '课程', icon: BookOpen, tile: '#0071e3' }, { to: '/teachers', text: '教师', icon: GraduationCap, tile: '#af52de' },
  { to: '/resources', text: '学习资料', icon: FolderOpen, tile: '#ff9500' }, { to: '/contributions', text: '存储贡献', icon: HardDrive, tile: '#32ade6' },
]
const intro = [
  { icon: BookOpen, tile: '#0071e3', title: '选课前先看同学怎么说', text: '按课程、教师、学期查看真实评价和五档评分。' },
  { icon: FolderOpen, tile: '#ff9500', title: '资料都按课程放好', text: '往年试卷、笔记和讲义，找到就能下载。' },
  { icon: CalendarClock, tile: '#ff3b30', title: '课表和待办放在一起', text: '今天上什么课、哪门课该写评价，一眼看到。' },
]
const go = () => router.push({ path: '/courses', query: q.value.trim() ? { q: q.value.trim() } : {} })
</script>

<template>
  <div v-if="!verified" class="stack-lg">
    <section class="hero">
      <p class="eyebrow">北航学生的课程与资料社区</p>
      <h1>选课、复习、交流，<br>都从这里开始。</h1>
      <p class="lead">同学写的课程评价，按课程整理的学习资料，还有你自己的课表。</p>
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
      <h1 class="hello">{{ greeting() }}，小航同学</h1>
      <form class="d-search" role="search" @submit.prevent="go">
        <Search aria-hidden="true" />
        <input v-model="q" type="search" aria-label="搜索课程或教师" placeholder="搜索课程、课程代码或教师">
      </form>
    </header>

    <nav class="shortcuts" aria-label="常用入口">
      <RouterLink v-for="s in shortcuts" :key="s.to" :to="s.to" class="shortcut">
        <span class="icon-tile" :style="{ '--tile': s.tile }"><component :is="s.icon" aria-hidden="true" /></span>{{ s.text }}
      </RouterLink>
    </nav>

    <div class="d-grid">
      <section class="card d-span-7 stack" aria-labelledby="h-today">
        <div class="row-between"><h2 id="h-today" class="d-title">{{ dayLabel }}</h2><RouterLink class="small" to="/me/courses">完整课表</RouterLink></div>
        <ol class="timeline">
          <li v-for="row in today" :key="row.name + row.start">
            <RouterLink :to="`/courses/${row.course}`" class="lesson" :style="{ '--c': row.color }">
              <span class="time">第 {{ row.start }}-{{ row.end }} 节</span>
              <span class="group-body"><b>{{ row.name }}</b><span class="subtle row"><MapPin class="pin" aria-hidden="true" />{{ row.place }} · {{ row.teacher }}</span></span>
            </RouterLink>
          </li>
        </ol>
      </section>

      <section class="card d-span-5 stack" aria-labelledby="h-todo">
        <h2 id="h-todo" class="d-title">等你处理</h2>
        <RouterLink class="todo" to="/courses/c2">
          <span class="icon-tile" style="--tile:#5856d6"><PenLine aria-hidden="true" /></span>
          <span class="group-body"><b>线性代数还没评价</b><span class="subtle">上学期已修完，写下感受能帮到学弟学妹</span></span><ArrowRight class="chevron" aria-hidden="true" />
        </RouterLink>
        <RouterLink class="todo" to="/me/reviews?tab=drafts">
          <span class="icon-tile" style="--tile:#ff9500"><FileText aria-hidden="true" /></span>
          <span class="group-body"><b>有 1 篇草稿没写完</b><span class="subtle">控制原理的学习建议</span></span><ArrowRight class="chevron" aria-hidden="true" />
        </RouterLink>
        <RouterLink class="todo" :to="notices[0]!.to">
          <span class="icon-tile" style="--tile:#34c759"><Sparkles aria-hidden="true" /></span>
          <span class="group-body"><b>{{ notices[0]!.title }}</b><span class="subtle">{{ relative(notices[0]!.at) }}</span></span><ArrowRight class="chevron" aria-hidden="true" />
        </RouterLink>
      </section>

      <section class="d-span-7 stack" aria-labelledby="h-hot">
        <div class="row-between"><h2 id="h-hot" class="d-title row"><Flame class="flame" aria-hidden="true" />同学都在看</h2><RouterLink class="small" to="/courses">全部课程</RouterLink></div>
        <ol class="group">
          <li v-for="(row, i) in hot" :key="row[0]">
            <RouterLink class="group-row" :to="`/courses/${row[0]}`">
              <span class="rank" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="group-body"><span class="group-title truncate">{{ row[1] }}</span><span class="subtle">{{ row[6] }} 学分 · 难度{{ levelText.difficulty[row[8][2]!] }}</span></span>
              <Level dim="recommendation" :level="row[8][0]!" />
            </RouterLink>
          </li>
        </ol>
      </section>

      <section class="d-span-5 stack" aria-labelledby="h-new">
        <div class="row-between"><h2 id="h-new" class="d-title">新上传的资料</h2><RouterLink class="small" to="/resources">全部资料</RouterLink></div>
        <ul class="group">
          <li v-for="row in fresh" :key="row.id">
            <RouterLink class="group-row" :to="`/resources/items/${row.id}`">
              <span class="group-body"><span class="group-title clamp-2">{{ row.current!.metadata.title }}</span><span class="subtle">{{ row.current!.category.names['zh-CN'] }} · {{ relative(row.current!.created_at) }}</span></span>
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
.top .d-search { flex: 0 1 26rem; }
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
.flame { width: 1.125rem; height: 1.125rem; color: #ff6a00; }
.rank { flex: none; width: 1.25rem; color: var(--label-3); font-weight: 650; font-variant-numeric: tabular-nums; text-align: center; }
.rank.top { color: #ff6a00; }
@media (max-width: 480px) { .time { width: 4.25rem; } }
</style>
