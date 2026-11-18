<script setup lang="ts">
import { Folder } from 'lucide-vue-next'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePaged } from '../../shared/composables/async'
import { localName, useResourcesApi, type Directory } from './api'
import { readTrail, rememberTrail } from './browseState'

// Hierarchical course directory selector for resource uploads and edits.
// Directories belong to a course; leaving the selection empty places the resource at the root.
const props = withDefaults(defineProps<{
  modelValue?: string
  school?: string
  course?: string
  disabled?: boolean
}>(), {
  modelValue: undefined,
  school: undefined,
  course: undefined,
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: string | undefined] }>()
const { t, locale } = useI18n()
const api = useResourcesApi()

const trail = shallowRef<Directory[]>([])
const currentId = computed(() => props.modelValue || '')

const directories = usePaged(async (after, signal) => {
  if (!props.course) return { items: [], next: '' }
  const page = await api.directories({ school_id: props.school, course_id: props.course, parent_id: currentId.value || undefined, after }, signal)
  return { items: page.items, next: page.next_cursor }
})

watch(() => [props.course, props.school, currentId.value] as const, ([course, , id]) => {
  if (!course) {
    trail.value = []
    directories.clear()
    return
  }
  if (!id) trail.value = []
  else if (trail.value.at(-1)?.id !== id) trail.value = readTrail(id)
  void directories.reload()
}, { immediate: true })

function selectRoot() {
  if (props.disabled) return
  trail.value = []
  emit('update:modelValue', undefined)
}

function selectDepth(depth: number) {
  if (props.disabled) return
  const next = trail.value.slice(0, depth)
  trail.value = next
  emit('update:modelValue', next.at(-1)?.id)
}

function enter(folder: Directory) {
  if (props.disabled) return
  const next = [...trail.value, folder]
  trail.value = next
  rememberTrail(folder.id, next)
  emit('update:modelValue', folder.id)
}
</script>

<template>
  <div
    class="field stack-sm"
    role="group"
    :aria-label="t('resources.editor.directory')"
  >
    <span class="field-label">{{ t('resources.editor.directory') }}</span>
    <p
      v-if="!course"
      class="field-hint"
    >
      {{ t('resources.editor.directoryChooseCourse') }}
    </p>
    <div
      v-else
      class="picker stack-sm"
    >
      <nav
        class="row small"
        :aria-label="t('resources.browse.folderPath')"
      >
        <button
          class="btn btn-sm"
          :class="currentId ? 'btn-ghost' : 'btn-primary'"
          type="button"
          :aria-pressed="!currentId"
          :disabled="disabled"
          @click="selectRoot"
        >
          {{ t('resources.browse.root') }}
        </button>
        <template v-if="trail.length">
          <template
            v-for="(item, index) in trail"
            :key="item.id"
          >
            <span aria-hidden="true">/</span>
            <button
              v-if="index < trail.length - 1"
              class="btn btn-sm btn-ghost"
              type="button"
              :disabled="disabled"
              @click="selectDepth(index + 1)"
            >
              {{ localName(item.names, locale) }}
            </button>
            <span
              v-else
              class="tag tag-info"
              aria-current="location"
            >{{ localName(item.names, locale) || t('resources.browse.currentFolder') }}</span>
          </template>
        </template>
        <template v-else-if="currentId">
          <span aria-hidden="true">/</span>
          <span
            class="tag tag-info"
            aria-current="location"
          >{{ t('resources.editor.selectedDirectory') }}</span>
        </template>
      </nav>
      <p
        v-if="directories.status.value === 'error'"
        class="field-error row small"
        role="alert"
      >
        <span>{{ t('resources.picker.unavailable', { label: t('resources.editor.directory') }) }}</span>
        <button
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="disabled"
          @click="directories.reload"
        >
          {{ t('resources.picker.retry') }}
        </button>
      </p>
      <div
        v-else-if="directories.items.value.length || directories.next.value"
        class="row"
      >
        <button
          v-for="item in directories.items.value"
          :key="item.id"
          class="btn btn-sm"
          type="button"
          :disabled="disabled"
          @click="enter(item)"
        >
          <Folder aria-hidden="true" />{{ localName(item.names, locale) }}
        </button>
        <button
          v-if="directories.next.value"
          class="btn btn-sm btn-ghost"
          type="button"
          :disabled="disabled || directories.appending.value"
          @click="directories.loadMore"
        >
          {{ t('common.loadMore') }}
        </button>
      </div>
      <p
        v-else-if="directories.status.value === 'ready' && !currentId"
        class="subtle"
      >
        {{ t('resources.browse.noFolders') }}
      </p>
    </div>
    <span class="field-hint">{{ t('resources.editor.directoryHint') }}</span>
  </div>
</template>

<style scoped>
.picker { padding: .625rem .75rem; border-radius: var(--radius); background: var(--fill); }
</style>
