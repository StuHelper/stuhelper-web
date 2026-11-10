<script setup lang="ts">
import { computed, ref, useId } from 'vue'

// 选项较少时平铺单选胶囊。超过 limit 时先收起，当前选中项始终可见。
const props = defineProps<{ label: string; options: { value: string; label: string }[]; disabled?: boolean; limit?: number; moreLabel?: string; compact?: boolean }>()
const model = defineModel<string>({ required: true })
const name = useId()
const expanded = ref(false)
const collapsed = computed(() => !!props.limit && !expanded.value && props.options.length > props.limit)
const visible = computed(() => {
  if (!collapsed.value) return props.options
  const head = props.options.slice(0, props.limit)
  const chosen = props.options.find((item) => item.value === model.value)
  return chosen && !head.includes(chosen) ? [...head, chosen] : head
})
</script>

<template>
  <fieldset
    class="choice-group"
    :class="{ compact }"
    :disabled="disabled"
  >
    <legend>{{ label }}</legend>
    <div class="choice-options">
      <label
        v-for="item in visible"
        :key="item.value"
        class="choice"
        :class="{ chosen: model === item.value }"
      >
        <input
          type="radio"
          :name="name"
          :value="item.value"
          :checked="model === item.value"
          @change="model = item.value"
        >
        <span>{{ item.label }}</span>
      </label>
      <button
        v-if="collapsed"
        class="choice more"
        type="button"
        @click="expanded = true"
      >
        {{ moreLabel }}
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.choice-group { display: grid; gap: .5rem; }
.choice-group legend { margin-block-end: .5rem; color: var(--label-2); font-size: .8125rem; font-weight: 500; }
.choice-options { display: flex; flex-wrap: wrap; gap: .375rem; }
.choice { position: relative; display: inline-flex; align-items: center; min-height: 36px; padding: .25rem .875rem; border: 0; border-radius: var(--pill); background: var(--fill); color: var(--label); font: inherit; font-size: .875rem; cursor: pointer; transition: transform .25s var(--spring); }
.choice:hover { background: var(--fill-strong); }
.choice:active { transform: scale(.95); }
.choice input { position: absolute; opacity: 0; pointer-events: none; }
.choice:focus-within, .more:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent-fill) 55%, transparent); outline-offset: 2px; }
.choice.chosen { background: var(--accent-fill); color: var(--on-accent); font-weight: 550; }
.more { background: transparent; color: var(--accent); }
/* 紧凑模式用于列表筛选：标题和选项同一行，选项过多时横滑。 */
.compact { display: flex; align-items: center; gap: .625rem; min-width: 0; }
.compact legend { float: left; flex: none; margin: 0; }
.compact .choice-options { flex-wrap: nowrap; min-width: 0; overflow-x: auto; scrollbar-width: none; padding-block: 3px; }
.compact .choice { flex: none; min-height: 30px; padding-block: .125rem; font-size: .8125rem; }
fieldset:disabled .choice { opacity: .5; cursor: default; }
@media (pointer: coarse) { .choice { min-height: 42px; } }
</style>
