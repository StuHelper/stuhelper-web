<script setup lang="ts">
import { Check, ChevronDown } from 'lucide-vue-next'
import { ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxPortal, ComboboxRoot, ComboboxTrigger, ComboboxViewport } from 'reka-ui'
import { computed, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorCode } from '../../shared/api/errors'
import { useAcademic, type CatalogObject, type ObjectKind } from '../academic/api'

// Choose a catalog object. Typing searches on the server, so long lists need no
// separate search control. An unknown association stays empty instead of being guessed.
const props = withDefaults(defineProps<{ kind: ObjectKind; label: string; school?: string; course?: string; term?: string; disabled?: boolean; emptyLabel?: string }>(), { school: undefined, course: undefined, term: undefined, disabled: false, emptyLabel: '' })
const model = defineModel<string | undefined>({ default: '' })
const { t } = useI18n()
const api = useAcademic()
const id = useId()
const items = shallowRef<CatalogObject[]>([])
const next = ref('')
const search = ref('')
const open = ref(false)
const busy = ref(false)
const error = ref('')
const selectedName = ref('')
const none = computed(() => props.emptyLabel || t('common.notSpecified'))
// Reka items cannot use an empty value, so 'no selection' has its own marker.
const noneValue = '__none__'
const selection = computed({
  get: () => model.value || noneValue,
  set: (value: string) => { model.value = value === noneValue ? '' : value },
})
let listRequest: AbortController | undefined
let timer: ReturnType<typeof setTimeout> | undefined

async function load(more = false) {
  clearTimeout(timer)
  listRequest?.abort()
  const controller = new AbortController()
  listRequest = controller
  busy.value = true
  error.value = ''
  try {
    const page = await api.objects({ kind: props.kind, school_id: props.school, course_id: props.course, term_id: props.term, q: search.value, after: more ? next.value : '', limit: 50 }, controller.signal)
    if (controller.signal.aborted) return
    items.value = more ? [...items.value, ...page.items] : page.items
    next.value = page.next
  } catch (failure) {
    if (!controller.signal.aborted) error.value = errorCode(failure)
  } finally {
    if (!controller.signal.aborted) busy.value = false
  }
}

// Show the name of a saved value that is not on the loaded page.
watch(model, async (value, _, onCleanup) => {
  if (!value) {
    selectedName.value = ''
    return
  }
  const known = items.value.find((item) => item.id === value)
  if (known) {
    selectedName.value = known.name
    return
  }
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const found = await api.lookup([value], controller.signal)
    if (!controller.signal.aborted) selectedName.value = found.get(value)?.name ?? t('common.unknown')
  } catch {
    if (!controller.signal.aborted) selectedName.value = t('common.unknown')
  }
}, { immediate: true })

function typed(value: string) {
  // The input also reports the display name when a choice is made; that is not a search.
  if (value === selectedName.value || value === search.value) return
  search.value = value
  clearTimeout(timer)
  listRequest?.abort()
  timer = setTimeout(() => { if (open.value) void load() }, 250)
}

watch(open, (value) => {
  if (value) {
    if (!items.value.length) void load()
    return
  }
  clearTimeout(timer)
  listRequest?.abort()
  busy.value = false
  if (!search.value) return
  search.value = ''
  items.value = []
  next.value = ''
})
watch(() => [props.kind, props.school, props.course, props.term], () => {
  items.value = []
  next.value = ''
  clearTimeout(timer)
  listRequest?.abort()
  if (open.value) void load()
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  listRequest?.abort()
})
</script>

<template>
  <div class="field">
    <label
      class="field-label"
      :for="id"
    >{{ label }}</label>
    <ComboboxRoot
      v-model="selection"
      v-model:open="open"
      :disabled="disabled"
      ignore-filter
      open-on-click
      open-on-focus
      class="picker"
    >
      <ComboboxAnchor class="picker-anchor">
        <ComboboxInput
          :id="id"
          class="input picker-input"
          autocomplete="off"
          :display-value="() => (model ? selectedName : '')"
          :placeholder="none"
          @update:model-value="typed"
        />
        <ComboboxTrigger
          class="picker-trigger"
          :aria-label="label"
        >
          <ChevronDown aria-hidden="true" />
        </ComboboxTrigger>
      </ComboboxAnchor>
      <ComboboxPortal>
        <ComboboxContent
          class="menu picker-menu"
          position="popper"
          :side-offset="6"
        >
          <ComboboxViewport class="picker-viewport">
            <ComboboxItem
              :value="noneValue"
              class="menu-item"
            >
              {{ none }}
            </ComboboxItem>
            <ComboboxItem
              v-for="item in items"
              :key="item.id"
              :value="item.id"
              class="menu-item"
            >
              <span class="truncate">{{ item.name }}</span>
              <Check
                v-if="model === item.id"
                aria-hidden="true"
                class="picker-check"
              />
            </ComboboxItem>
            <p
              v-if="!items.length && !busy && !error"
              class="menu-label"
            >
              {{ t('resources.picker.noMatch') }}
            </p>
            <button
              v-if="next"
              class="btn btn-sm btn-ghost picker-more"
              type="button"
              :disabled="busy"
              @click="load(true)"
            >
              {{ t('common.loadMore') }}
            </button>
          </ComboboxViewport>
        </ComboboxContent>
      </ComboboxPortal>
    </ComboboxRoot>
    <p
      v-if="error"
      class="field-error row"
      role="alert"
    >
      <span>{{ t('resources.picker.unavailable', { label }) }}</span>
      <button
        class="btn btn-sm btn-ghost"
        type="button"
        @click="load()"
      >
        {{ t('resources.picker.retry') }}
      </button>
    </p>
  </div>
</template>

<style scoped>
.picker-anchor { position: relative; display: flex; align-items: center; }
.picker-input { padding-inline-end: 2.5rem; }
.picker-trigger { position: absolute; inset-inline-end: 0; display: grid; place-items: center; width: 2.5rem; height: 100%; border: 0; background: transparent; color: var(--label-3); cursor: pointer; }
.picker-trigger svg { width: 1rem; height: 1rem; }
</style>
<style>
/* The menu renders in a portal, outside this component's scope. */
.picker-menu { z-index: 70; width: var(--reka-combobox-trigger-width); max-height: 18rem; overflow: hidden; background: var(--surface-raised); backdrop-filter: none; -webkit-backdrop-filter: none; }
.picker-viewport { max-height: calc(18rem - .75rem); overflow-y: auto; }
.picker-menu .menu-item { justify-content: space-between; }
.picker-check { flex: none; }
.picker-more { width: 100%; }
</style>
