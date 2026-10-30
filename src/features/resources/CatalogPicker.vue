<script setup lang="ts">
import { onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorCode } from '../../shared/api/errors'
import { useAcademic, type CatalogObject, type ObjectKind } from '../academic/api'

// Choose a catalog object, with server-side search for long lists. An unknown
// association stays empty instead of being guessed.
const props = withDefaults(defineProps<{ kind: ObjectKind; label: string; school?: string; course?: string; term?: string; disabled?: boolean; emptyLabel?: string }>(), { school: undefined, course: undefined, term: undefined, disabled: false, emptyLabel: '' })
const model = defineModel<string | undefined>({ default: '' })
const { t } = useI18n()
const api = useAcademic()
const items = shallowRef<CatalogObject[]>([])
const next = ref('')
const search = ref('')
const busy = ref(false)
const error = ref('')
const selectedName = ref('')
let generation = 0

async function load(more = false) {
  const current = ++generation
  busy.value = true
  error.value = ''
  try {
    const page = await api.objects({ kind: props.kind, school_id: props.school, course_id: props.course, term_id: props.term, q: search.value, after: more ? next.value : '', limit: 100 })
    if (current !== generation) return
    items.value = more ? [...items.value, ...page.items] : page.items
    next.value = page.next
  } catch (failure) {
    if (current === generation) error.value = errorCode(failure)
  } finally {
    if (current === generation) busy.value = false
  }
}

// Show the name of a saved value that is not on the loaded page.
async function resolveSelected() {
  selectedName.value = ''
  const id = model.value
  if (!id || items.value.some((item) => item.id === id)) return
  try {
    selectedName.value = (await api.lookup([id])).get(id)?.name ?? ''
  } catch {
    selectedName.value = ''
  }
}

function choose(event: Event) {
  model.value = event.target instanceof HTMLSelectElement ? event.target.value : ''
}

watch(() => [props.kind, props.school, props.course, props.term], () => {
  items.value = []
  next.value = ''
  void load()
})
watch(model, () => void resolveSelected())
onMounted(async () => {
  await load()
  await resolveSelected()
})
</script>

<template>
  <div class="field picker">
    <label class="field">
      <span class="field-label">{{ label }}</span>
      <select
        class="select"
        :value="model ?? ''"
        :disabled="disabled"
        @change="choose"
      >
        <option value="">{{ emptyLabel || t('common.notSpecified') }}</option>
        <option
          v-if="model && !items.some((item) => item.id === model)"
          :value="model"
        >{{ selectedName || t('common.unknown') }}</option>
        <option
          v-for="item in items"
          :key="item.id"
          :value="item.id"
        >{{ item.name }}</option>
      </select>
    </label>
    <div class="row picker-search">
      <input
        v-model="search"
        class="input"
        type="search"
        :aria-label="t('resources.picker.search', { label })"
        :placeholder="t('resources.picker.placeholder')"
        :disabled="disabled"
        @keydown.enter.prevent="load()"
      >
      <button
        class="btn btn-sm"
        type="button"
        :disabled="disabled || busy"
        @click="load()"
      >
        {{ t('common.search') }}
      </button>
      <button
        v-if="next"
        class="btn btn-sm btn-ghost"
        type="button"
        :disabled="disabled || busy"
        @click="load(true)"
      >
        {{ t('common.loadMore') }}
      </button>
    </div>
    <p
      v-if="error"
      class="field-error"
    >
      {{ t('resources.picker.unavailable') }}
      <button
        class="btn btn-sm btn-ghost"
        type="button"
        @click="load()"
      >
        {{ t('common.retry') }}
      </button>
    </p>
  </div>
</template>

<style scoped>
.picker { gap: .4rem; }
.picker-search { flex-wrap: nowrap; }
.picker-search .input { min-height: 32px; padding-block: .2rem; font-size: .86rem; }
</style>
