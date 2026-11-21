<script setup lang="ts">
import { Check, Search } from 'lucide-vue-next'
import { ListboxContent, ListboxFilter, ListboxItem, ListboxItemIndicator, ListboxRoot, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger, SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectViewport } from 'reka-ui'
import { computed, Fragment, ref, useAttrs, useId, watch, type VNode } from 'vue'
import { useI18n } from 'vue-i18n'

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

// Long lists (more than ten choices) open with a search field so a choice can be typed
// instead of scrolled to. Matching ignores case and spaces inside the label.
const searchLimit = 10
const { t } = useI18n()
const listId = useId()
const open = ref(false)
const query = ref('')
watch(open, (value) => { if (!value) query.value = '' })
const normal = (value: string) => value.toLocaleLowerCase().replace(/\s+/gu, '')
const matching = () => {
  const needle = normal(query.value)
  return needle ? options().filter((item) => normal(item.label).includes(needle)) : options()
}
function pick(value: unknown) {
  if (typeof value !== 'string') return
  open.value = false
  choose(value)
}

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
    <PopoverRoot
      v-if="options().length > searchLimit + 1"
      v-model:open="open"
    >
      <PopoverTrigger
        class="app-select-trigger"
        role="combobox"
        :aria-expanded="open"
        :aria-controls="open ? listId : undefined"
        :disabled="disabled"
        :data-state="open ? 'open' : 'closed'"
        v-bind="triggerAttrs"
      >
        <span class="truncate">{{ shown() }}</span>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          class="app-popup app-select-content app-search-content"
          align="start"
          :side-offset="6"
          :collision-padding="8"
        >
          <ListboxRoot
            :model-value="text || EMPTY"
            highlight-on-hover
            @update:model-value="pick"
          >
            <label class="app-search-field">
              <Search aria-hidden="true" />
              <ListboxFilter
                v-model="query"
                class="app-search-input"
                auto-focus
                :placeholder="t('common.searchOptions')"
                :aria-label="t('common.searchOptions')"
              />
            </label>
            <ListboxContent
              :id="listId"
              class="app-search-list"
            >
              <ListboxItem
                v-for="item in matching()"
                :key="item.value"
                class="app-select-item"
                :value="item.value || EMPTY"
                :disabled="item.disabled"
                :lang="item.lang"
              >
                <span class="truncate">{{ item.label }}</span>
                <ListboxItemIndicator class="app-select-check"><Check aria-hidden="true" /></ListboxItemIndicator>
              </ListboxItem>
              <p
                v-if="!matching().length"
                class="app-search-empty"
              >
                {{ t('common.noOptionMatch') }}
              </p>
            </ListboxContent>
          </ListboxRoot>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
    <SelectRoot
      v-else
      :model-value="text || EMPTY"
      :disabled="disabled"
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
