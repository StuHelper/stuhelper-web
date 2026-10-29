<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  call,
  type AcademicObject,
  type ObjectPage,
  query,
} from '../academic/api';
import { useHostFetch } from '../api/host';
import StatusBlock from './StatusBlock.vue';
const props = defineProps<{
  kind: string;
  modelValue?: string;
  school?: string;
  course?: string;
  term?: string;
  disabled?: boolean;
  required?: boolean;
}>();
defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n(),
  fetcher = useHostFetch();
const items = ref<AcademicObject[]>([]),
  after = ref(''),
  search = ref(''),
  busy = ref(false),
  error = ref('');
let generation = 0;
async function load(more = false) {
  const current = ++generation;
  busy.value = true;
  error.value = '';
  try {
    const page = await call<ObjectPage>(
      'catalog',
      '/objects' +
        query({
          kind: props.kind,
          school_id: props.school,
          course_id: props.course,
          term_id: props.term,
          q: search.value,
          after: more ? after.value : '',
          limit: '100',
        }),
      'Page',
      {},
      fetcher,
    );
    if (current !== generation) return;
    items.value = more ? [...items.value, ...page.items] : page.items;
    after.value = page.next;
  } catch {
    error.value = 'unavailable';
  } finally {
    if (current === generation) busy.value = false;
  }
}
watch(
  () => [props.kind, props.school, props.course, props.term],
  () => {
    items.value = [];
    after.value = '';
    void load();
  },
  { immediate: true },
);
function choose(event: Event) {
  const target = event.target;
  return target instanceof HTMLSelectElement ? target.value : '';
}
</script>
<template>
  <div class="resource-field">
    <label>{{ t(`resources.catalog.${kind}`)
    }}<select
      :value="modelValue ?? ''"
      :required="required"
      :disabled="disabled || busy"
      @change="$emit('update:modelValue', choose($event))"
    >
      <option value="">{{ t('resources.unknown') }}</option>
      <option
        v-if="modelValue && !items.some((x) => x.id === modelValue)"
        :value="modelValue"
      >
        {{ modelValue }}
      </option>
      <option
        v-for="item in items"
        :key="item.id"
        :value="item.id"
      >
        {{ item.name }}
      </option>
    </select></label>
    <div class="resource-actions">
      <input
        v-model="search"
        type="search"
        :aria-label="t('resources.searchOptions')"
        :disabled="disabled"
        @keydown.enter.prevent="load()"
      ><button
        type="button"
        :disabled="disabled || busy"
        @click="load()"
      >
        {{ t('resources.search') }}
      </button><button
        v-if="after"
        type="button"
        :disabled="disabled || busy"
        @click="load(true)"
      >
        {{ t('resources.more') }}
      </button>
    </div>
    <StatusBlock
      :error="error"
      @retry="load()"
    />
  </div>
</template>
