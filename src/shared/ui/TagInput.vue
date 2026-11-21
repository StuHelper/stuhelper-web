<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

// Tags typed one at a time: Enter, a comma or leaving the field turns the text into a tag,
// and the field is ready for the next one. Backspace in an empty field takes the last tag back
// for editing. Duplicates are ignored; a tag that is too long or one too many is not added.
const props = withDefaults(defineProps<{ label: string; hint?: string; max?: number; maxLength?: number; disabled?: boolean }>(), { hint: '', max: 20, maxLength: 64, disabled: false })
const tags = defineModel<string[]>({ required: true })
const { t } = useI18n()
const draft = ref('')
const problem = ref<'' | 'tooLong' | 'tooMany'>('')
const input = ref<HTMLInputElement>()
const id = `tags-${Math.random().toString(36).slice(2)}`
const full = computed(() => tags.value.length >= props.max)

function commit(text = draft.value) {
  const pieces = text.split(/[,，\n]/u).map((piece) => piece.trim()).filter(Boolean)
  const next = [...tags.value]
  let left = ''
  problem.value = ''
  for (const piece of pieces) {
    if ([...piece].length > props.maxLength) { problem.value = 'tooLong'; left = piece; continue }
    if (next.some((tag) => tag.toLocaleLowerCase() === piece.toLocaleLowerCase())) continue
    if (next.length >= props.max) { problem.value = 'tooMany'; left = piece; break }
    next.push(piece)
  }
  if (next.length !== tags.value.length) tags.value = next
  // Text that could not become a tag stays in the field so it can be fixed.
  draft.value = left
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
    event.preventDefault()
    commit()
  } else if (event.key === 'Backspace' && !draft.value && tags.value.length) {
    event.preventDefault()
    draft.value = tags.value[tags.value.length - 1] ?? ''
    tags.value = tags.value.slice(0, -1)
    problem.value = ''
  }
}
function paste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!/[,，\n]/u.test(text)) return
  event.preventDefault()
  commit(draft.value + text)
}
function remove(index: number) {
  tags.value = tags.value.filter((_, i) => i !== index)
  problem.value = ''
  input.value?.focus()
}
</script>

<template>
  <div class="field">
    <label
      class="field-label"
      :for="id"
    >{{ label }}</label>
    <div
      class="tag-box input"
      :class="{ disabled }"
      @click.self="input?.focus()"
    >
      <ul
        v-if="tags.length"
        class="tag-list"
        :aria-label="label"
      >
        <li
          v-for="(tag, index) in tags"
          :key="tag"
          class="tag-chip"
        >
          <span class="truncate">{{ tag }}</span>
          <button
            type="button"
            class="tag-remove"
            :aria-label="t('tags.remove', { tag })"
            :disabled="disabled"
            @click="remove(index)"
          >
            <X aria-hidden="true" />
          </button>
        </li>
      </ul>
      <input
        :id="id"
        ref="input"
        v-model="draft"
        class="tag-entry"
        enterkeyhint="done"
        :maxlength="maxLength * 2"
        :disabled="disabled || (full && !draft)"
        :placeholder="full ? '' : tags.length ? t('tags.more') : t('tags.placeholder')"
        :aria-invalid="!!problem || undefined"
        :aria-describedby="`${id}-hint`"
        @keydown="keydown"
        @blur="commit()"
        @paste="paste"
      >
    </div>
    <span
      :id="`${id}-hint`"
      class="field-hint"
    >{{ hint || t('tags.hint', { max }) }}</span>
    <span
      v-if="problem"
      class="field-error"
      role="alert"
    >{{ problem === 'tooLong' ? t('tags.tooLong', { max: maxLength }) : t('tags.tooMany', { max }) }}</span>
  </div>
</template>

<style scoped>
.tag-box { display: flex; flex-wrap: wrap; align-items: center; gap: .375rem; min-height: 44px; height: auto; padding: .375rem .5rem; cursor: text; }
.tag-box.disabled { cursor: default; opacity: .6; }
.tag-list { display: contents; margin: 0; padding: 0; list-style: none; }
.tag-chip { display: inline-flex; align-items: center; gap: .125rem; max-width: 100%; min-height: 28px; padding-inline: .625rem .25rem; border-radius: var(--pill); background: var(--accent-soft); color: var(--accent); font-size: .875rem; font-weight: 550; }
.tag-remove { display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.tag-remove:hover { background: color-mix(in srgb, currentcolor 14%, transparent); }
.tag-remove svg { width: 14px; height: 14px; }
.tag-entry { flex: 1 1 8rem; min-width: 6rem; min-height: 28px; padding: 0 .25rem; border: 0; outline: none; background: transparent; color: inherit; font: inherit; }
@media (pointer: coarse) { .tag-remove { width: 28px; height: 28px; } }
</style>
