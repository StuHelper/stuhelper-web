<script setup lang="ts">
import { computed } from 'vue'
import type { PlatformError } from '../api/client'

const props = defineProps<{ state: 'loading' | 'ready' | 'error'; error: PlatformError['code'] | null; admin: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const message = computed(() => {
  if (props.state === 'loading') return '正在连接服务…'
  if (props.state === 'ready') return props.admin ? '管理服务已连接' : '服务已连接'
  const messages = {
    network: '暂时无法连接服务，请稍后重试。',
    incompatible: '服务版本暂不兼容，请更新页面后重试。',
    identity: '管理员身份服务尚未接入。',
    unauthenticated: '请先登录后访问管理工作台。',
    forbidden: '当前账号没有访问管理工作台的权限。',
    unavailable: '服务暂时不可用，请稍后重试。',
  }
  return messages[props.error ?? 'unavailable']
})
</script>

<template>
  <section
    class="connection"
    :class="`connection-${state}`"
    aria-label="服务连接状态"
    :aria-busy="state === 'loading'"
  >
    <div
      class="connection-copy"
      role="status"
      aria-live="polite"
    >
      <span
        class="status-dot"
        aria-hidden="true"
      />
      <span>{{ message }}</span>
    </div>
    <button
      v-if="state === 'error'"
      class="retry-button"
      type="button"
      @click="emit('retry')"
    >
      重新连接
    </button>
  </section>
</template>

<style scoped>
.connection { display: flex; justify-content: space-between; align-items: center; gap: 1rem; border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.2rem; background: var(--surface); }
.connection-copy { display: flex; align-items: center; gap: .7rem; color: var(--muted); font-size: .9rem; line-height: 1.6; }
.status-dot { display: block; flex: 0 0 7px; height: 7px; border-radius: 50%; background: #7b8490; }
.connection-ready .status-dot { background: #2b795c; }
.connection-error .status-dot { background: #aa6d27; }
.retry-button { flex-shrink: 0; min-height: 40px; border: 1px solid var(--border); background: var(--surface); color: var(--accent); border-radius: 5px; padding: .4rem .7rem; cursor: pointer; font: inherit; font-size: .8rem; }
.retry-button:hover { background: var(--accent-soft); }
@media (max-width: 480px) { .connection { align-items: flex-start; flex-direction: column; } }
</style>
