<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import TabBar from '../../shared/ui/TabBar.vue'

// Campus verification is one place with two roles. Most people are students,
// so that role comes first and is the page the shared entry opens.
const props = defineProps<{ role: 'student' | 'teacher' }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const paths = { student: '/me/verification', teacher: '/me/verification/teacher' } as const
const tabs = computed(() => [
  { value: 'student' as const, label: t('verification.unified.student') },
  { value: 'teacher' as const, label: t('verification.unified.teacher') },
])
// The return address of a content gate stays with the person across roles.
const selected = computed({
  get: () => props.role,
  set: (role) => { if (role !== props.role) void router.push({ path: paths[role], query: route.query.next ? { next: route.query.next } : {} }) },
})
</script>

<template>
  <TabBar
    v-model="selected"
    :tabs="tabs"
    :label="t('verification.unified.roles')"
    id-prefix="verification-role"
  />
</template>
