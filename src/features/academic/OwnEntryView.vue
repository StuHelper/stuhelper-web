<script setup lang="ts">
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRouter } from 'vue-router'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import MeLayout from '../account/MeLayout.vue'
import { useAcademic, type Review } from './api'
import ReviewCard from './ReviewCard.vue'

// One of the author's own entries, including entries that are not public.
const props = defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()
const api = useAcademic()
const entry = useAsync(async (signal) => {
  const review = await api.myEntry(props.id, signal)
  return { review, names: await api.lookup([review.target_id, review.term_id, review.teacher_id], signal) }
})
watch(() => props.id, () => void entry.reload(), { immediate: true })
function updated(review: Review) {
  if (entry.data.value) entry.data.value = { ...entry.data.value, review }
}
</script>

<template>
  <MeLayout :title="t('me.ownEntry')">
    <div class="stack">
      <p>
        <RouterLink to="/me/reviews">
          {{ t('me.backToReviews') }}
        </RouterLink>
      </p>
      <AsyncState
        :status="entry.status.value"
        :error="entry.error.value"
        @retry="entry.reload"
      >
        <ReviewCard
          v-if="entry.data.value"
          :review="entry.data.value.review"
          :names="entry.data.value.names"
          @updated="updated"
          @removed="router.replace('/me/reviews')"
        />
      </AsyncState>
    </div>
  </MeLayout>
</template>
