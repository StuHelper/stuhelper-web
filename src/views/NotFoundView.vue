<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section>
    <p class="eyebrow">
      404
    </p>
    <h1>这个页面暂不可用</h1>
    <p class="description">
      地址可能有误，或对应功能尚未开放。
    </p>
    <RouterLink
      class="home-link"
      to="/"
    >
      返回首页
    </RouterLink>
  </section>
</template>

<style scoped>
.eyebrow { color: var(--accent); letter-spacing: .1em; }
.description { color: var(--muted); line-height: 1.8; }
.home-link { display: inline-block; margin-top: 1rem; color: var(--accent); padding: .5rem 0; }
</style>
