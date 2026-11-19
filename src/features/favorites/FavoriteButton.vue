<script setup lang="ts">
import { Bookmark, BookmarkCheck } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorCode } from '../../shared/api/errors'
import { useSession } from '../../shared/session'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import { useFavoritesApi, type Favorite, type FavoriteKind } from './api'
import { favoriteFailed, favoriteGeneration, favoriteOf, moveTarget, rememberFavorite, requestFavorite } from './state'

defineOptions({ inheritAttrs: false })

// Saves or removes one course, teacher or resource. The state comes from one batched
// lookup per kind; while it is unknown the button stays disabled instead of guessing.
// `quiet` is for rows of a list, where the mark has no surface until it is pointed at or switched on.
const props = defineProps<{ kind: FavoriteKind; id: string; text?: boolean; quiet?: boolean; inlineMove?: boolean }>()
const emit = defineEmits<{ moving: [] }>()
const { t } = useI18n()
const errorText = useErrorText()
const api = useFavoritesApi()
const session = useSession()
const busy = ref(false)
const pop = ref(false)
const current = computed(() => favoriteOf(props.kind, props.id))
const failed = computed(() => favoriteFailed(props.kind, props.id))
const on = computed(() => !!current.value)
const signedIn = computed(() => session.state.value === 'member')

watch(() => [props.kind, props.id, signedIn.value] as const, ([kind, id, member]) => {
  if (member) requestFavorite(api, kind, id)
}, { immediate: true })

async function add(folder?: string) {
  const currentGeneration = favoriteGeneration()
  const item = await api.add({ kind: props.kind, target_id: props.id, ...(folder ? { folder_id: folder } : {}) }, crypto.randomUUID())
  if (currentGeneration !== favoriteGeneration()) return
  rememberFavorite(item.kind, item.target_id, item)
  return item
}

function openFolderPicker(item: Favorite, profileId?: string) {
  if (!profileId || session.session.value?.profile.id !== profileId) return
  moveTarget.value = { item, profileId }
}

async function toggle() {
  if (busy.value) return
  if (!signedIn.value) {
    void session.signIn()
    return
  }
  if (failed.value) {
    requestFavorite(api, props.kind, props.id, true)
    return
  }
  const currentGeneration = favoriteGeneration()
  const item = current.value
  if (item === undefined) return
  const profileId = session.session.value?.profile.id
  busy.value = true
  try {
    if (item) {
      await api.remove(item.id, { revision: item.revision }, crypto.randomUUID())
      if (currentGeneration !== favoriteGeneration()) return
      rememberFavorite(item.kind, item.target_id, null)
      // Undo restores the favorite in the folder it was in.
      toast(t('favorites.removed'), () => currentGeneration === favoriteGeneration() && void add(item.folder_id).catch((failure) => toast(errorText(errorCode(failure)))))
    } else {
      const added = await add()
      if (!added) return
      pop.value = true
      toast(
        t('favorites.saved'),
        () => {
          const saved = current.value
          if (saved && currentGeneration === favoriteGeneration()) void api.remove(saved.id, { revision: saved.revision }, crypto.randomUUID()).then(() => { if (currentGeneration === favoriteGeneration()) rememberFavorite(saved.kind, saved.target_id, null) }).catch((failure) => toast(errorText(errorCode(failure))))
        },
        { label: t('favorites.moveTo'), run: () => openFolderPicker(added, profileId) },
      )
    }
  } catch (failure) {
    // The outcome may be unknown; read the server state again instead of assuming.
    if (currentGeneration !== favoriteGeneration()) return
    toast(errorText(errorCode(failure)))
    requestFavorite(api, props.kind, props.id, true)
  } finally {
    busy.value = false
  }
}

const label = computed(() => (failed.value ? t('favorites.unknown') : on.value ? t('favorites.remove') : t('favorites.add')))
</script>

<template>
  <button
    v-bind="$attrs"
    class="btn"
    :class="[text ? '' : 'btn-sm btn-icon', { 'btn-quiet': quiet }]"
    type="button"
    :aria-pressed="on"
    :aria-label="text ? undefined : label"
    :title="text ? undefined : label"
    :disabled="busy || (signedIn && current === undefined && !failed)"
    :data-pop="pop || undefined"
    @click="toggle"
    @animationend="pop = false"
  >
    <BookmarkCheck
      v-if="on"
      aria-hidden="true"
    />
    <Bookmark
      v-else
      aria-hidden="true"
    />
    <template v-if="text">
      {{ on ? t('favorites.saved') : t('favorites.add') }}
    </template>
  </button>
  <button
    v-if="inlineMove && current && signedIn"
    class="btn"
    type="button"
    @click="openFolderPicker(current, session.session.value?.profile.id); emit('moving')"
  >
    {{ t('favorites.moveTo') }}
  </button>
</template>
