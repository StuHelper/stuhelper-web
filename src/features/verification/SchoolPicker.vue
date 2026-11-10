<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorCode } from '../../shared/api/errors'
import ErrorNotice from '../../shared/ui/ErrorNotice.vue'
import { useVerification, type School } from './api'

const props = defineProps<{ modelValue: string; schools: readonly School[]; disabled?: boolean }>()
const emit = defineEmits<{ select: [school: School] }>()
const { t } = useI18n()
const api = useVerification()
const query = ref('')
const results = shallowRef<School[]>()
const loading = ref(false)
const error = ref('')
const cursor = ref('')
const options = computed(() => results.value ?? props.schools)
const selected = computed(() => props.schools.find((school) => school.id === props.modelValue))
let controller: AbortController | undefined
let searched = ''

async function search(append = false) {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = ''
  if (!append) searched = query.value
  try {
    const page = await api.list('School', '/api/v1/verification/schools', { q: searched, after: append ? cursor.value : '', limit: 20, signal: request.signal })
    if (controller !== request) return
    results.value = append ? [...(results.value ?? []), ...page.items] : page.items
    cursor.value = page.next
  } catch (failure) {
    if (request.signal.aborted) return
    error.value = errorCode(failure)
    if (!append) results.value = []
  } finally {
    if (controller === request) loading.value = false
  }
}
onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <fieldset
    class="stack-sm"
    :disabled="disabled"
    :aria-busy="loading"
  >
    <legend class="field-label">
      {{ t('verification.school') }}
    </legend>
    <div class="search-row">
      <label class="field grow">
        <span class="sr-only">{{ t('verification.schoolSearch') }}</span>
        <input
          v-model="query"
          class="input"
          type="search"
          :maxlength="200"
          :placeholder="t('verification.schoolSearch')"
          @keydown.enter.prevent="search()"
        >
      </label>
      <button
        class="btn"
        type="button"
        @click="search()"
      >
        {{ t('common.search') }}
      </button>
    </div>
    <ErrorNotice
      v-if="error"
      :code="error"
      @retry="search()"
    />
    <p
      v-if="loading"
      class="muted small"
      role="status"
    >
      {{ t('common.loading') }}
    </p>
    <p
      v-else-if="!options.length && !error"
      class="muted small"
      role="status"
    >
      {{ t('verification.noSchools') }}
    </p>
    <p
      v-if="selected && !options.some((item) => item.id === modelValue)"
      class="muted small"
    >
      {{ selected.name }}
    </p>
    <label
      v-for="item in options"
      :key="item.id"
      class="check"
    >
      <input
        type="radio"
        name="verification-school-choice"
        :value="item.id"
        :checked="modelValue === item.id"
        @change="emit('select', item)"
      >
      <span>{{ item.name }}</span>
    </label>
    <button
      v-if="cursor"
      class="btn btn-sm"
      type="button"
      :disabled="loading"
      @click="search(true)"
    >
      {{ t('common.loadMore') }}
    </button>
  </fieldset>
</template>
