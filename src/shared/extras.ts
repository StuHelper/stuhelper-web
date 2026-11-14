import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

/**
 * Extension points used only by the review prototype (VITE_DEMO). They stay
 * empty in a normal build, where the prototype code is not bundled at all.
 */
/** One row of the conversation list: a person or a group, its latest message and unread count. */
export interface MessageThread {
  id: string
  kind: 'direct' | 'group'
  name: string
  preview: string
  at: string
  unread: number
  to: string
}

export const extras = {
  routes: [] as RouteRecordRaw[],
  navLinks: [] as { to: string; text: string; section: string }[],
  navTools: [] as Component[],
  floating: [] as Component[],
  /** Conversations other than notification boxes, listed in the message center. */
  threads: [] as MessageThread[],
  subjectActions: [] as Component[],
  subjectPanels: [] as Component[],
  /** Prototype pages build some lists once during setup, so a language change remounts them. */
  remountOnLocale: false,
  signIn: undefined as undefined | (() => void),
}
