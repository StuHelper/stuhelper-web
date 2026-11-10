<script setup lang="ts">
import { Scale } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { toast } from '../../shared/ui/toast'
import { compareList, maxCompare, toggleCompare, type CompareKind } from './compare'

// Adds the current course or teacher to the comparison list kept in this browser.
const props = defineProps<{ kind: CompareKind; id: string }>()
const { t } = useI18n()
const format = useFormat()
const on = computed(() => compareList[props.kind].includes(props.id))
function toggle() {
  if (!toggleCompare(props.kind, props.id)) toast(t('search.compare.full', { max: format.value.number(maxCompare) }))
}
</script>

<template>
  <button
    class="btn"
    type="button"
    :aria-pressed="on"
    @click="toggle"
  >
    <Scale aria-hidden="true" />{{ on ? t('search.compare.added') : t('search.compare.add') }}
  </button>
</template>
