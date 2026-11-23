<script setup lang="ts">
import { ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronRight } from 'lucide-vue-next'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { violationGroups, type ViolationCategory } from './categories'

// The fixed violation categories shared by review reports and resource complaints. The field
// opens a sheet that lays every category out at once, grouped, with its description, so a reader
// can compare them without scrolling a narrow list. Picking one closes the sheet and returns
// focus to the field.
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
const category = defineModel<ViolationCategory | ''>({ required: true })
const { t } = useI18n()
const id = useId()
const open = ref(false)

function pick(code: ViolationCategory) {
  category.value = code
  open.value = false
}
</script>

<template>
  <div class="field">
    <span
      :id="`${id}-label`"
      class="field-label"
    >{{ t('violation.label') }}</span>
    <button
      class="input violation-trigger"
      type="button"
      aria-haspopup="dialog"
      :aria-labelledby="`${id}-label`"
      :aria-describedby="category ? `${id}-value ${id}-hint` : `${id}-value`"
      :disabled="disabled"
      @click="open = true"
    >
      <span
        :id="`${id}-value`"
        class="truncate"
        :class="{ placeholder: !category }"
      >{{ category ? t(`violation.categories.${category}.name`) : t('common.choose') }}</span>
      <ChevronRight aria-hidden="true" />
    </button>
    <span
      v-if="category"
      :id="`${id}-hint`"
      class="field-hint"
    >{{ t(`violation.categories.${category}.hint`) }}</span>
    <SheetDialog
      :open="open"
      :title="t('violation.pick')"
      wide
      @close="open = false"
    >
      <div class="violation-groups">
        <section
          v-for="group in violationGroups"
          :key="group.id"
          class="violation-group"
          :aria-labelledby="`${id}-${group.id}`"
        >
          <h3
            :id="`${id}-${group.id}`"
            class="violation-group-title"
          >
            {{ t(`violation.groups.${group.id}`) }}
          </h3>
          <ul class="violation-grid">
            <li
              v-for="code in group.categories"
              :key="code"
            >
              <button
                class="violation-option"
                type="button"
                :aria-pressed="category === code"
                :aria-describedby="`${id}-${code}`"
                @click="pick(code)"
              >
                <span class="violation-name">
                  {{ t(`violation.categories.${code}.name`) }}
                  <Check
                    v-if="category === code"
                    aria-hidden="true"
                  />
                </span>
                <span
                  :id="`${id}-${code}`"
                  class="violation-hint"
                >{{ t(`violation.categories.${code}.hint`) }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </SheetDialog>
  </div>
</template>

<style scoped>
.violation-trigger { display: flex; align-items: center; justify-content: space-between; gap: .5rem; inline-size: 100%; text-align: start; cursor: pointer; }
.violation-trigger svg { flex: none; inline-size: 1rem; block-size: 1rem; color: var(--label-3); }
.violation-trigger:dir(rtl) svg { transform: scaleX(-1); }
.placeholder { color: var(--label-3); }
.violation-groups { display: grid; gap: 1.125rem; max-block-size: min(70vh, 40rem); overflow-y: auto; overscroll-behavior: contain; padding-block-end: .25rem; }
.violation-group { display: grid; gap: .5rem; }
.violation-group-title { margin: 0; color: var(--label-2); font-size: .8125rem; font-weight: 600; }
.violation-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: .5rem; margin: 0; padding: 0; list-style: none; }
.violation-grid li { display: flex; }
.violation-option { display: grid; flex: 1; align-content: start; gap: .25rem; padding: .625rem .75rem; border: 1px solid var(--separator); border-radius: var(--radius-sm); background: var(--surface); color: var(--label); font: inherit; text-align: start; cursor: pointer; transition: border-color .15s, background-color .15s; }
.violation-option:hover { border-color: var(--accent); }
.violation-option:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.violation-option[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); }
.violation-name { display: flex; align-items: center; justify-content: space-between; gap: .5rem; font-weight: 600; font-size: .9375rem; }
.violation-name svg { flex: none; inline-size: 1rem; block-size: 1rem; color: var(--accent); }
.violation-hint { color: var(--label-2); font-size: .8125rem; line-height: 1.45; }
@media (prefers-reduced-motion: reduce) { .violation-option { transition: none; } }
</style>
