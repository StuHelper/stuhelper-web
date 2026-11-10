<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { ref, useId, watch } from 'vue'

// 折叠区。内容第一次展开时才渲染，收起后保留，避免重复请求和重播图表动画。
const props = defineProps<{ label: string; storageKey?: string }>()
const panel = useId()
function saved() {
  if (!props.storageKey) return false
  try { return localStorage.getItem(props.storageKey) === '1' } catch { return false }
}
const open = ref(saved())
const mounted = ref(open.value)
watch(open, (value) => {
  if (value) mounted.value = true
  if (!props.storageKey) return
  try { localStorage.setItem(props.storageKey, value ? '1' : '0') } catch { /* 隐私窗口下只影响记忆 */ }
})
</script>

<template>
  <section class="collapse">
    <button
      class="collapse-head"
      type="button"
      :aria-expanded="open"
      :aria-controls="panel"
      @click="open = !open"
    >
      <span>{{ label }}</span>
      <ChevronDown
        :class="{ flip: open }"
        aria-hidden="true"
      />
    </button>
    <div
      :id="panel"
      class="collapse-body"
      :class="{ open }"
    >
      <div class="collapse-inner">
        <slot v-if="mounted" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.collapse-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; width: 100%; min-height: 44px; padding: .5rem 1rem; border: 0; border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-card); color: var(--label); font: inherit; font-weight: 550; cursor: pointer; }
.collapse-head:hover { background: var(--fill); }
.collapse-head svg { width: 1.125rem; height: 1.125rem; color: var(--label-3); transition: transform .25s var(--ease-out); }
.collapse-head svg.flip { transform: rotate(180deg); }
.collapse-body { display: grid; grid-template-rows: 0fr; visibility: hidden; transition: grid-template-rows .28s var(--ease-out), visibility .28s; }
.collapse-body.open { grid-template-rows: 1fr; visibility: visible; }
.collapse-inner { min-height: 0; overflow: hidden; }
.collapse-body.open .collapse-inner { padding-block-start: .75rem; }
</style>
