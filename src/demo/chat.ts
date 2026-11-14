import { reactive } from 'vue'
import type { MessageThread } from '../shared/extras'
import * as d from './data'

// 示例会话：两个私信和一个群聊，用来审阅消息中心容纳会话的版式。消息只存在于当前页面。
export interface ChatMessage { id: string; from: string; mine: boolean; text: string; at: string }
export interface Chat { id: string; kind: 'direct' | 'group'; name: string; members: number; unread: number; messages: ChatMessage[] }

const m = (id: string, from: string, text: string, days: number, hours: number, mine = false): ChatMessage => ({ id, from, mine, text, at: d.ago(days, hours) })
export const chats = reactive<Chat[]>([
  { id: 'g1', kind: 'group', name: '数据结构与算法 · 课程交流群', members: 86, unread: 5, messages: [
    m('g1-1', '林知远', '第三次上机的图遍历大家用的邻接表还是邻接矩阵？', 0, 6),
    m('g1-2', '周清和', '邻接表，稀疏图省内存。', 0, 5),
    m('g1-3', '小航同学', '我上传了去年的上机复盘，在资料区可以找到。', 0, 5, true),
    m('g1-4', '许文澜', '收到，谢谢。期末范围老师说下周公布。', 0, 1),
  ] },
  { id: 'p1', kind: 'direct', name: '方亦舟', members: 2, unread: 2, messages: [
    m('p1-1', '方亦舟', '你写的机器学习基础评价很详细，想请教一下期末大作业的选题。', 0, 4),
    m('p1-2', '小航同学', '可以，我当时做的是校园图像分类。', 0, 3, true),
    m('p1-3', '方亦舟', '数据集是自己标注的吗？', 0, 2),
  ] },
  { id: 'p2', kind: 'direct', name: '陈砚秋', members: 2, unread: 0, messages: [
    m('p2-1', '小航同学', '操作系统的实验报告模板我放到资料区了。', 1, 3, true),
    m('p2-2', '陈砚秋', '看到了，已经下载。', 1, 2),
  ] },
])

export const chatThreads = (): MessageThread[] => chats.map((chat) => {
  const last = chat.messages.at(-1)!
  return { id: chat.id, kind: chat.kind, name: chat.name, preview: chat.kind === 'group' && !last.mine ? `${last.from}：${last.text}` : last.text, at: last.at, unread: chat.unread, to: `/notifications/chats/${chat.id}` }
})
