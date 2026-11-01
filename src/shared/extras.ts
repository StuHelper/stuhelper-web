import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

/**
 * Extension points used only by the review prototype (VITE_DEMO). They stay
 * empty in a normal build, where the prototype code is not bundled at all.
 */
export const extras = {
  routes: [] as RouteRecordRaw[],
  navLinks: [] as { to: string; text: string; section: string }[],
  meLinks: [] as { to: string; text: string; icon: Component; tile: string }[],
  navTools: [] as Component[],
  floating: [] as Component[],
  /** Prototype pages that replace a default destination in the account menu. */
  accountLinks: {} as { favorites?: string; settings?: string },
  subjectActions: [] as Component[],
  subjectPanels: [] as Component[],
  /** Prototype pages build some lists once during setup, so a language change remounts them. */
  remountOnLocale: false,
  signIn: undefined as undefined | (() => void),
}
