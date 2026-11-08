import { computed, reactive, ref } from 'vue'
import { i18n } from '../app/i18n'
import { tr } from './tr'
import { ago, courseSeeds, teachesIn, terms } from './data'

import { toast } from '../shared/ui/toast'
export { toast }

export type Notice = { id: string; kind: 'review' | 'resource' | 'system' | 'account' | 'wallet'; title: string; body: string; at: string; read: boolean; to: string }
export const notices = reactive<Notice[]>([
  { id: 'n1', kind: 'review', title: '有人回复了你的评价', body: '航小北回复了《适合想做项目的同学》：“你们组的数据集是怎么准备的？”', at: ago(0, 1), read: false, to: '/reviews/r16' },
  { id: 'n2', kind: 'resource', title: '资料审核通过', body: '《自动控制原理重点公式速查》已发布，获得 5 Ivory 奖励。', at: ago(0, 6), read: false, to: '/resources/items/x7' },
  { id: 'n3', kind: 'wallet', title: 'Ivory 即将到期', body: '有 20 Ivory 将于 11 月 30 日到期，记得及时使用。', at: ago(1), read: false, to: '/me/wallet' },
  { id: 'n4', kind: 'account', title: '学生认证将于 2027 年 7 月到期', body: '到期后需要重新认证才能继续浏览校内内容。', at: ago(3), read: true, to: '/me/verification' },
  { id: 'n5', kind: 'review', title: '你的评价收到 10 个赞同', body: '《适合想做项目的同学》获得了更多同学认可。', at: ago(5), read: true, to: '/reviews/r16' },
  { id: 'n6', kind: 'system', title: '选课季课程评价已更新', body: '2026 秋季学期的开课信息已同步，可以查看任课教师和历史评价。', at: ago(8), read: true, to: '/courses' },
])
export const unread = computed(() => notices.filter((row) => !row.read).length)

/** 数组形状不变，文案在读取时才翻译，切换语言后下一次渲染就是新语言。 */
const lazyList = (keys: string[]) => new Proxy(keys, { get: (target, prop, receiver) => { const value = Reflect.get(target, prop, receiver); return typeof prop === 'string' && /^\d+$/.test(prop) ? tr(value as string) : value } })

export const levelText = {
  recommendation: lazyList(['demo.levelNone', 'demo.levelStronglyNot', 'demo.levelNotRecommended', 'demo.levelAverage', 'demo.levelRecommended', 'demo.levelStrongly']),
  quality: lazyList(['demo.levelNone', 'demo.levelVeryPoor', 'demo.levelPoor', 'demo.levelAverage', 'demo.levelGood', 'demo.levelVeryGood']),
  difficulty: lazyList(['demo.levelNone', 'demo.levelVeryEasy', 'demo.levelEasy', 'demo.levelModerate', 'demo.levelHard', 'demo.levelVeryHard']),
  workload: lazyList(['demo.levelNone', 'demo.levelVeryLittle', 'demo.levelLittle', 'demo.levelModerate', 'demo.levelMuch', 'demo.levelVeryMuch']),
  grading: lazyList(['demo.levelNone', 'demo.gradingVeryPoor', 'demo.gradingPoor', 'demo.levelAverage', 'demo.gradingGood', 'demo.gradingVeryGood']),
}
export const greeting = (name: string) => { const h = new Date().getHours(); return tr(h < 6 ? 'demo.lateNight' : h < 12 ? 'demo.goodMorning' : h < 18 ? 'demo.goodAfternoon' : 'demo.goodEvening', { name }) }
export const relative = (iso: string) => {
  const format = new Intl.RelativeTimeFormat(i18n.global.locale.value, { numeric: 'auto' })
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4)
  if (m < 60) return format.format(-Math.max(m, 1), 'minute')
  const h = Math.round(m / 60)
  if (h < 24) return format.format(-h, 'hour')
  const days = Math.round(h / 24)
  return days < 30 ? format.format(-days, 'day') : format.format(-Math.round(days / 30), 'month')
}
export const fileSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)

// 周课表：weekday 1-7，start/end 为节次。
export const timetable = [
  { course: 'c3', name: '数据结构与算法', teacher: '许文澜', place: '新主楼 A201', day: 1, start: 1, end: 2, color: 'var(--c-blue)', weeks: '1-16 周' },
  { course: 'c3', name: '数据结构与算法', teacher: '许文澜', place: '新主楼 G 机房', day: 4, start: 6, end: 7, color: 'var(--c-blue)', weeks: '3-14 周' },
  { course: 'c5', name: '自动控制原理', teacher: '沈若谷', place: '主 M101', day: 2, start: 3, end: 4, color: 'var(--c-orange)', weeks: '1-16 周' },
  { course: 'c5', name: '自动控制原理', teacher: '沈若谷', place: '主 M101', day: 5, start: 1, end: 2, color: 'var(--c-orange)', weeks: '1-16 周' },
  { course: 'c8', name: '信号与系统', teacher: '叶听澜', place: '新主楼 F306', day: 3, start: 6, end: 7, color: 'var(--c-purple)', weeks: '1-16 周' },
  { course: 'c10', name: '机器学习基础', teacher: '方亦舟', place: '教三 402', day: 2, start: 8, end: 9, color: 'var(--c-green)', weeks: '1-12 周' },
  { course: 'c10', name: '机器学习基础', teacher: '方亦舟', place: '教三 402', day: 5, start: 3, end: 4, color: 'var(--c-green)', weeks: '1-12 周' },
]
export const periods = ['08:00', '08:50', '09:50', '10:40', '11:30', '14:00', '14:50', '15:50', '16:40', '17:30', '19:00', '19:50']

// —— 对比、收藏和评分图表的演示状态 ——
export const MAX_COMPARE = 4
export type CompareKind = 'course' | 'teacher'
export const compare = reactive<Record<CompareKind, string[]>>({ course: [], teacher: [] })
export function toggleCompare(kind: CompareKind, id: string) {
  const list = compare[kind]; const at = list.indexOf(id)
  if (at >= 0) { list.splice(at, 1); return }
  if (list.length >= MAX_COMPARE) { toast(tr('demo.compareLimit', { p0: MAX_COMPARE })); return }
  list.push(id)
}


const seed = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7)
/** 演示用的五档人数，集中在当前档位附近。页面只画比例，不显示均分或百分比。 */
export function distribution(id: string, level: number) {
  const base = 14 + (seed(id) % 50)
  return [1, 2, 3, 4, 5].map((n) => Math.round(base * ([1, .48, .2, .08, .03][Math.abs(n - level)] ?? 0)))
}
/** 演示用的学期趋势：较早学期可能样本不足，level 为 0 表示暂无足够数据。 */
export function trend(id: string, level: number) {
  return terms.map((term, i) => {
    const samples = (seed(id + term.id) % 28) + (i === terms.length - 1 ? 6 : 0)
    const shift = i === terms.length - 1 ? 0 : (seed(id + i) % 3) - 1
    return { term: term.name.replace(/^20(\d\d) (.)季学期$/, '$1$2'), name: term.name, samples, level: samples < 5 ? 0 : Math.max(1, Math.min(5, level + shift)) }
  })
}
const taughtBy = (id: string) => teachesIn.filter(([, p]) => p === id).map(([c]) => courseSeeds.find((row) => row[0] === c)!)
/** 与规格一致：对教师的课程等权平均后，再回到五档。 */
export const teacherLevels = (id: string) => [0, 1, 2, 3, 4].map((i) => { const rows = taughtBy(id); return rows.length ? Math.round(rows.reduce((s, r) => s + r[8][i]!, 0) / rows.length) : 0 })
export const courseLevels = (id: string) => [...(courseSeeds.find((row) => row[0] === id)?.[8] ?? [0, 0, 0, 0, 0])]
export const levelsOf = (kind: CompareKind, id: string) => (kind === 'course' ? courseLevels(id) : teacherLevels(id))
export const dimNames = ['recommendation', 'quality', 'difficulty', 'workload', 'grading'] as const
export const dimLabels = lazyList(['demo.recommendation', 'demo.dimQuality', 'demo.dimDifficulty', 'demo.dimWorkload', 'demo.dimGrading'])
