<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectViewport } from 'reka-ui'
import { computed, Fragment, ref, useAttrs, type VNode } from 'vue'

/**
 * 替代原生下拉框。选项写法和原生一样，在默认插槽里写 <option>。
 * proxy 是视觉隐藏的 input，负责参与表单校验，并作为 change 事件的 target，
 * 所以调用方可以继续读取 target.value 和调用 setCustomValidity。
 */
defineOptions({ inheritAttrs: false })
// Pages with a reserved scrollbar gutter and sticky navigation can keep scrolling
// while the list is open; the default remains unchanged for other consumers.
const props = withDefaults(defineProps<{ modelValue?: string | number | null; disabled?: boolean; required?: boolean; bodyLock?: boolean }>(), { modelValue: undefined, bodyLock: true })
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [event: Event] }>()
const slots = defineSlots<{ default?: () => VNode[] }>()
const attrs = useAttrs()
const proxy = ref<HTMLInputElement>()
// Reka 的选项值不能是空字符串，而“全部”“请选择”这类选项的值都是空字符串。
const EMPTY = '__empty__'
const text = computed(() => String(props.modelValue ?? ''))
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))
const triggerAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class' && key !== 'style')))
const direction = () => (document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr')

interface Option { value: string; label: string; disabled: boolean; lang?: string }
function collect(nodes: VNode[] = []): Option[] {
  return nodes.flatMap((node) => {
    if (node.type === Fragment && Array.isArray(node.children)) return collect(node.children as VNode[])
    if (node.type !== 'option') return []
    const own = node.props ?? {}
    const label = Array.isArray(node.children) ? node.children.map((child) => (typeof child === 'object' && child && 'children' in child ? child.children : child)).join('') : node.children
    return [{ value: String(own.value ?? ''), label: String(label ?? '').trim(), disabled: own.disabled === true || own.disabled === '', lang: own.lang }]
  })
}
const options = () => collect(slots.default?.())
const shown = () => options().find((item) => item.value === text.value)?.label ?? ''

function choose(value: unknown) {
  const next = value === EMPTY ? '' : String(value)
  emit('update:modelValue', next)
  if (proxy.value) {
    proxy.value.value = next
    proxy.value.dispatchEvent(new Event('change'))
  }
}
</script>

<template>
  <span
    class="app-select app-control"
    v-bind="rootAttrs"
    :data-disabled="disabled ? '' : undefined"
  >
    <SelectRoot
      :model-value="text || EMPTY"
      :disabled="disabled"
      :dir="direction()"
      @update:model-value="choose"
    >
      <SelectTrigger
        class="app-select-trigger"
        v-bind="triggerAttrs"
      >
        <span class="truncate">{{ shown() }}</span>
      </SelectTrigger>
      <SelectPortal>
        <SelectContent
          class="app-popup app-select-content"
          :body-lock="bodyLock"
          position="popper"
          :side-offset="6"
          :collision-padding="8"
        >
          <SelectViewport>
            <SelectItem
              v-for="item in options()"
              :key="item.value"
              class="app-select-item"
              :value="item.value || EMPTY"
              :disabled="item.disabled"
              :lang="item.lang"
            >
              <SelectItemText>{{ item.label }}</SelectItemText>
              <SelectItemIndicator class="app-select-check"><Check aria-hidden="true" /></SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
    <input
      ref="proxy"
      class="app-proxy"
      :value="text"
      :required="required"
      tabindex="-1"
      aria-hidden="true"
      @change.stop="emit('change', $event)"
    >
  </span>
</template>
