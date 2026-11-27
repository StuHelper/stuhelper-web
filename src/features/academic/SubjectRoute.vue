<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import { useAcademic } from './api'
import { subjectPath } from './paths'
import SubjectView from './SubjectView.vue'

/**
 * The course and teacher pages are addressed by short addresses. The address in the path
 * is resolved to the object, the path is rewritten to the current address (an older
 * address or an internal id is replaced, keeping the query and hash), and the page is
 * shown for the internal id that reviews, favorites and statistics use.
 */
const props = defineProps<{ kind: 'course' | 'teacher'; address: string }>()
const api = useAcademic()
const route = useRoute()
const router = useRouter()
// Reuse the resolution only for the navigation started by our own replace.
let replacement: { kind: 'course' | 'teacher'; address: string; id: string } | undefined

const target = useAsync(async (signal) => {
  const { kind, address } = props
  const pending = replacement
  replacement = undefined
  if (pending?.kind === kind && pending.address === address) return pending.id

  const resolved = await api.address(kind, address, signal)
  signal.throwIfAborted()
  if (resolved.object.kind !== kind) throw new ApiError('not_found')
  const id = resolved.object.canonical_id || resolved.object.id
  const current = resolved.object.address_id || id
  if (current !== address) {
    const next = { kind, address: current, id }
    replacement = next
    try {
      await router.replace({ path: subjectPath(kind, current), query: route.query, hash: route.hash })
    } finally {
      if (replacement === next) replacement = undefined
    }
  }
  return id
})
watch(() => [props.kind, props.address], () => { void target.reload() }, { immediate: true })
const id = computed(() => target.data.value)
</script>

<template>
  <SubjectView
    v-if="id"
    :id="id"
    :key="`${kind}:${id}`"
    :kind="kind"
  />
  <AsyncState
    v-else
    skeleton="detail"
    :status="target.status.value"
    :error="target.error.value"
    @retry="target.reload"
  />
</template>
