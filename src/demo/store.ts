import { computed, reactive, ref } from 'vue'
import { ago } from './data'

export const toasts = ref<{ id: number; text: string }[]>([])
let seq = 0
export function toast(text: string) {
  const id = ++seq
  toasts.value.push({ id, text })
  setTimeout(() => { toasts.value = toasts.value.filter((row) => row.id !== id) }, 2600)
}

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

export const levelText = {
  recommendation: ['暂无', '强烈不推荐', '不推荐', '一般', '推荐', '强烈推荐'],
  quality: ['暂无', '很差', '较差', '一般', '较好', '很好'],
  difficulty: ['暂无', '很容易', '较容易', '适中', '较难', '很难'],
  workload: ['暂无', '很少', '较少', '适中', '较多', '很多'],
  grading: ['暂无', '体验很差', '体验较差', '一般', '体验较好', '体验很好'],
}
export const greeting = () => { const h = new Date().getHours(); return h < 6 ? '夜深了' : h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好' }
export const relative = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4); if (m < 60) return `${Math.max(m, 1)} 分钟前`; const h = Math.round(m / 60); if (h < 24) return `${h} 小时前`; const days = Math.round(h / 24); return days < 30 ? `${days} 天前` : `${Math.round(days / 30)} 个月前` }
export const fileSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`)

// 周课表：weekday 1-7，start/end 为节次。
export const timetable = [
  { course: 'c3', name: '数据结构与算法', teacher: '许文澜', place: '新主楼 A201', day: 1, start: 1, end: 2, color: '#0071e3', weeks: '1-16 周' },
  { course: 'c3', name: '数据结构与算法', teacher: '许文澜', place: '新主楼 G 机房', day: 4, start: 6, end: 7, color: '#0071e3', weeks: '3-14 周' },
  { course: 'c5', name: '自动控制原理', teacher: '沈若谷', place: '主 M101', day: 2, start: 3, end: 4, color: '#ff9500', weeks: '1-16 周' },
  { course: 'c5', name: '自动控制原理', teacher: '沈若谷', place: '主 M101', day: 5, start: 1, end: 2, color: '#ff9500', weeks: '1-16 周' },
  { course: 'c8', name: '信号与系统', teacher: '叶听澜', place: '新主楼 F306', day: 3, start: 6, end: 7, color: '#af52de', weeks: '1-16 周' },
  { course: 'c10', name: '机器学习基础', teacher: '方亦舟', place: '教三 402', day: 2, start: 8, end: 9, color: '#34c759', weeks: '1-12 周' },
  { course: 'c10', name: '机器学习基础', teacher: '方亦舟', place: '教三 402', day: 5, start: 3, end: 4, color: '#34c759', weeks: '1-12 周' },
]
export const periods = ['08:00', '08:50', '09:50', '10:40', '11:30', '14:00', '14:50', '15:50', '16:40', '17:30', '19:00', '19:50']
