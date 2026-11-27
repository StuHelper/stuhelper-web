<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
// Addresses already resolved in this visit, so replacing the path does not resolve again.
const known = ref(new Map<string, string>())

const target = useAsync(async (signal) => {
  const cached = known.value.get(props.address)
  if (cached) return cached
  const resolved = await api.address(props.kind, props.address, signal)
  if (resolved.object.kind !== props.kind) throw new ApiError('not_found')
  const id = resolved.object.canonical_id || resolved.object.id
  const address = resolved.object.address_id || id
  known.value.set(props.address, id).set(address, id)
  if (address !== props.address) await router.replace({ path: subjectPath(props.kind, address), query: route.query, hash: route.hash })
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
