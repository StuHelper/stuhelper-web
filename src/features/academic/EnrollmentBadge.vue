<script setup lang="ts">
import { BadgeCheck, CircleAlert, CircleHelp } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// The enrollment status a course review carries from its publication. The server decides it
// from the author's own school data authorization; the page only shows the snapshot.
const props = defineProps<{ status: 'enrolled' | 'not_enrolled' | 'unknown' }>()
const { t } = useI18n()
const look = computed(() => ({
  enrolled: { tone: 'success', icon: BadgeCheck },
  not_enrolled: { tone: 'danger', icon: CircleAlert },
  unknown: { tone: 'warning', icon: CircleHelp },
}[props.status]))
</script>

<template>
  <span
    class="tag enrollment"
    :class="`tag-${look.tone}`"
    :title="t(`academic.enrollmentStatus.hint.${status}`)"
  >
    <component
      :is="look.icon"
      aria-hidden="true"
    />{{ t(`academic.enrollmentStatus.label.${status}`) }}
    <span class="visually-hidden">{{ t(`academic.enrollmentStatus.hint.${status}`) }}</span>
  </span>
</template>

<style scoped>
.enrollment { gap: .3125rem; padding-inline: .5rem .625rem; box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 24%, transparent); white-space: nowrap; cursor: help; }
.enrollment svg { flex: none; width: 14px; height: 14px; stroke-width: 2.25; }
</style>
