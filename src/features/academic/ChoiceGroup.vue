<script setup lang="ts">
import { BadgeCheck } from 'lucide-vue-next'
import { computed, ref, useId } from 'vue'

// 选项较少时平铺胶囊。超过 limit 时先收起，选中项和标记项始终可见。
// multiple 时为复选，model 是选中值的数组；否则为单选，model 是一个值。
// marked 的选项（例如本人选课记录中的学期和教师）换色并带图标，markLabel 供读屏读出。
type Option = { value: string; label: string; marked?: boolean }
const props = defineProps<{ label: string; options: Option[]; disabled?: boolean; limit?: number; moreLabel?: string; compact?: boolean; multiple?: boolean; markLabel?: string }>()
const model = defineModel<string | string[]>({ required: true })
const name = useId()
const expanded = ref(false)
const selected = (value: string) => (Array.isArray(model.value) ? model.value.includes(value) : model.value === value)
const collapsed = computed(() => !!props.limit && !expanded.value && props.options.length > props.limit)
const visible = computed(() => {
  if (!collapsed.value) return props.options
  const head = props.options.slice(0, props.limit)
  return [...head, ...props.options.slice(props.limit).filter((item) => selected(item.value) || item.marked)]
})
function toggle(value: string, checked: boolean) {
  if (!props.multiple) {
    model.value = value
    return
  }
  const current = Array.isArray(model.value) ? model.value : []
  // Keep the option order so the saved selection does not depend on click order.
  const next = new Set(checked ? [...current, value] : current.filter((item) => item !== value))
  model.value = props.options.map((item) => item.value).filter((item) => next.has(item)).concat(current.filter((item) => next.has(item) && !props.options.some((o) => o.value === item)))
}
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
        :class="{ chosen: selected(item.value), marked: item.marked }"
      >
        <input
          :type="multiple ? 'checkbox' : 'radio'"
          :name="name"
          :value="item.value"
          :checked="selected(item.value)"
          @change="toggle(item.value, ($event.target as HTMLInputElement).checked)"
        >
        <BadgeCheck
          v-if="item.marked"
          class="mark-icon"
          aria-hidden="true"
        />
        <span>{{ item.label }}</span>
        <span
          v-if="item.marked && markLabel"
          class="visually-hidden"
        >{{ markLabel }}</span>
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
/* 本人选课记录中的选项：绿色描边和图标，选中后仍保留图标。 */
.choice.marked { gap: .3125rem; padding-inline-start: .625rem; box-shadow: inset 0 0 0 1.5px var(--success); background: var(--success-soft); color: var(--success); font-weight: 550; }
.choice.marked.chosen { background: var(--accent-fill); color: var(--on-accent); }
.mark-icon { flex: none; width: 1rem; height: 1rem; color: var(--success); }
.choice.chosen .mark-icon { color: var(--on-accent); }
.more { background: transparent; color: var(--accent); }
/* 紧凑模式用于列表筛选：标题和选项同一行，选项过多时横滑。 */
.compact { display: flex; align-items: center; gap: .625rem; min-width: 0; }
.compact legend { float: left; flex: none; margin: 0; }
.compact .choice-options { flex-wrap: nowrap; min-width: 0; overflow-x: auto; scrollbar-width: none; padding-block: 3px; }
.compact .choice { flex: none; min-height: 30px; padding-block: .125rem; font-size: .8125rem; }
fieldset:disabled .choice { opacity: .5; cursor: default; }
@media (pointer: coarse) { .choice { min-height: 42px; } }
</style>
