<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <a
    class="skip-link"
    href="#main-content"
  >跳至主要内容</a>
  <div class="app-shell ">
    <header class="app-header">
      <RouterLink
        class="brand"
        to="/"
        aria-label="StuHelper 首页"
      >
        <img
          class="brand-mark"
          src="/brand.png"
          alt=""
          width="44"
          height="44"
        >
        <span>StuHelper<span class="brand-context">校园空间</span></span>
      </RouterLink>
      <span class="stage-label">开发预览</span>
    </header>
    <main
      id="main-content"
      class="main-content"
      tabindex="-1"
    >
      <slot />
    </main>
    <footer class="app-footer">
      <span>StuHelper</span>
      <span>当前版本正在准备中</span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell { min-height: 100dvh; display: flex; flex-direction: column; }
.app-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem clamp(1.25rem, 5vw, 5rem); border-bottom: 1px solid var(--border); background: var(--surface); }
.brand { display: inline-flex; align-items: center; gap: .7rem; color: var(--text); text-decoration: none; font-size: 1.15rem; font-weight: 700; letter-spacing: -.025em; }
.brand-mark { object-fit: contain; }
.brand-context { display: block; font-size: .7rem; letter-spacing: .1em; color: var(--muted); font-weight: 500; margin-top: .15rem; }
.stage-label { color: var(--muted); font-size: .8rem; border: 1px solid var(--border); padding: .3rem .65rem; border-radius: 4px; }
.main-content { flex: 1; width: min(100% - 3rem, 68rem); margin: 0 auto; padding: clamp(3rem, 9vh, 7rem) 0; }
.app-footer { display: flex; justify-content: space-between; gap: 1rem; padding: 1.25rem clamp(1.25rem, 5vw, 5rem); color: var(--muted); font-size: .75rem; border-top: 1px solid var(--border); }
.admin-shell { --accent: #455d58; --accent-soft: #e8efec; }
</style>
