<script setup lang="ts">
import { Download, FileText, FileType2, Search, Upload } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import PageHeader from '../../shared/ui/PageHeader.vue'
import { courses, resCategories, resources } from '../data'
import { fileSize, relative, toast } from '../store'

const route = useRoute()
const q = ref('')
const cat = ref('')
const course = ref(typeof route.query.course === 'string' ? route.query.course : '')
const selecting = ref(false)
const picked = ref<string[]>([])
const rows = computed(() => resources.filter((r) => r.current).filter((r) => { const m = r.current!.metadata; return (!q.value.trim() || m.title.includes(q.value.trim()) || m.description.includes(q.value.trim())) && (!cat.value || m.category_id === cat.value) && (!course.value || m.associations.course_id === course.value) }))
const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? ''
const tints: Record<string, string> = { exam: '#ff3b30', note: '#ff9500', slide: '#0071e3', solution: '#34c759' }
function download(name: string) { toast(`已开始下载：${name}`) }
function batch() { toast(`已打包 ${picked.value.length} 个文件`); picked.value = []; selecting.value = false }
</script>

<template>
  <div class="stack-lg">
    <PageHeader title="学习资料" description="同学整理的试卷、笔记和讲义，按课程查找。">
      <template #actions>
        <RouterLink class="btn btn-sm" to="/me/resources">我的资料</RouterLink>
        <RouterLink class="btn btn-sm btn-primary" to="/resources/new"><Upload aria-hidden="true" />上传</RouterLink>
      </template>
    </PageHeader>
    <div class="stack">
      <div class="row filters">
        <div class="d-search"><Search aria-hidden="true" /><input v-model="q" type="search" aria-label="搜索资料" placeholder="搜索资料标题或描述"></div>
        <select v-model="course" class="select mini" aria-label="所属课程"><option value="">全部课程</option><option v-for="c in courses" :key="c.id" :value="c.id">{{ c.name }}</option></select>
      </div>
      <div class="row-between">
        <div class="d-chips" role="group" aria-label="资料分类">
          <button class="d-chip" type="button" :aria-pressed="!cat" @click="cat = ''">全部</button>
          <button v-for="c in resCategories" :key="c.id" class="d-chip" type="button" :aria-pressed="cat === c.id" @click="cat = c.id">{{ c.names['zh-CN'] }}</button>
        </div>
        <button class="btn btn-sm btn-ghost" type="button" :aria-pressed="selecting" @click="selecting = !selecting; picked = []">{{ selecting ? '取消选择' : '批量下载' }}</button>
      </div>
    </div>

    <div v-if="!rows.length" class="card empty stack">
      <p>没有找到匹配的资料。</p>
      <RouterLink class="btn btn-sm btn-primary" style="justify-self:center" to="/resources/new">上传第一份</RouterLink>
    </div>
    <ul v-else class="files">
      <li v-for="r in rows" :key="r.id" class="card file">
        <label v-if="selecting" class="pick-wrap"><input v-model="picked" class="pick" type="checkbox" :value="r.id" :aria-label="`选择 ${r.current!.metadata.title}`"></label>
        <span class="thumb" :style="{ '--c': tints[r.current!.metadata.category_id] }" aria-hidden="true"><FileType2 v-if="r.current!.file!.filename.endsWith('docx')" /><FileText v-else /><i>{{ r.current!.file!.filename.split('.').at(-1) }}</i></span>
        <div class="group-body body">
          <RouterLink class="card-title" :to="`/resources/items/${r.id}`">{{ r.current!.metadata.title }}</RouterLink>
          <p class="muted small clamp-2">{{ r.current!.metadata.description }}</p>
          <p class="subtle">{{ courseName(r.current!.metadata.associations.course_id!) }} · {{ r.current!.category.names['zh-CN'] }} · {{ fileSize(r.current!.file!.size) }} · {{ relative(r.current!.created_at) }}</p>
        </div>
        <button v-if="!selecting" class="btn btn-icon dl" type="button" :aria-label="`下载 ${r.current!.metadata.title}`" @click="download(r.current!.file!.filename)"><Download aria-hidden="true" /></button>
      </li>
    </ul>
    <Transition name="page">
      <div v-if="selecting && picked.length" class="bar">
        <span>已选 {{ picked.length }} 个</span>
        <button class="btn btn-sm btn-primary" type="button" @click="batch">打包下载</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.filters { gap: .5rem; }
.mini { width: auto; min-height: 42px; padding-block: .375rem; border-radius: var(--pill); background-color: var(--surface); box-shadow: var(--shadow-card); font-size: .9375rem; flex: 0 1 13rem; }
.files { display: grid; gap: .875rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 30rem), 1fr)); }
.file { display: flex; align-items: flex-start; gap: .875rem; padding: 1rem; transition: box-shadow .3s; }
.file:hover { box-shadow: var(--shadow-lift); }
.body { gap: .25rem; }
.thumb { position: relative; display: grid; flex: none; justify-items: center; align-content: center; gap: 1px; width: 52px; height: 64px; border-radius: 10px; background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); }
.thumb svg { width: 22px; height: 22px; }
.thumb i { font-size: .625rem; font-style: normal; font-weight: 700; text-transform: uppercase; }
.dl { flex: none; background: transparent; color: var(--accent); }
.dl:hover { background: var(--accent-soft); color: var(--accent); }
.pick-wrap { display: flex; align-self: center; }
.bar { position: sticky; inset-block-end: calc(var(--tab-height) + 1rem); display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .625rem .75rem .625rem 1.25rem; border-radius: var(--pill); background: var(--glass); box-shadow: var(--shadow-float); backdrop-filter: blur(24px); }
@media (min-width: 761px) { .bar { inset-block-end: 1rem; } }
</style>
