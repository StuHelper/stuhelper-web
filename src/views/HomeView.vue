<script setup lang="ts">
import ConnectionStatus from '../components/ConnectionStatus.vue'
import { usePlatform } from '../composables/usePlatform'

const { state, error, reload } = usePlatform({ admin: false })
</script>

<template>
  <div class="home-view">
    <p class="eyebrow">
      YOUR CAMPUS, CONNECTED
    </p>
    <h1 class="page-title">
      为校园服务，留好每一个位置。
    </h1>
    <p class="page-description">
      课程、评价与学习资料将在这里相遇。当前提供应用基础页面，校园功能会在完成后逐步开放。
    </p>
    <ConnectionStatus
      class="service-status"
      :state="state"
      :error="error"
      :admin="false"
      @retry="reload"
    />
    <div class="preparation-note">
      <span
        class="note-index"
        aria-hidden="true"
      >01 /</span>
      <p>当前为开发预览。页面暂不提供登录、评价发布或资料购买。</p>
    </div>
  </div>
</template>

<style scoped>
.home-view { max-width: 48rem; }
.eyebrow { font-size: .7rem; font-weight: 700; letter-spacing: .18em; color: var(--accent); margin: 0 0 1.5rem; }
.page-title { max-width: 14em; font-size: clamp(2rem, 4.5vw, 3.7rem); line-height: 1.28; letter-spacing: -.04em; font-weight: 650; margin: 0; text-wrap: balance; }
.page-description { max-width: 36rem; margin: 1.75rem 0 2.5rem; color: var(--muted); line-height: 1.9; font-size: 1.03rem; }
.service-status { max-width: 38rem; }
.preparation-note { margin-top: 4rem; display: flex; align-items: baseline; gap: 1rem; border-top: 1px solid var(--border); padding-top: 1.3rem; max-width: 38rem; }
.note-index { color: var(--accent); font-size: .75rem; font-family: ui-monospace, monospace; white-space: nowrap; }
.preparation-note p { margin: 0; font-size: .8rem; line-height: 1.8; color: var(--muted); }
</style>
