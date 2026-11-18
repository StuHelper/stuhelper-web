<script setup lang="ts">
import { Bookmark, BookmarkCheck, Folder } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import { useSession } from '../../shared/session'
import AsyncState from '../../shared/ui/AsyncState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../../shared/ui/toast'
import { useErrorText } from '../../shared/ui/messages'
import { useFavoritesApi, type FavoriteKind, type Folder as FolderRow } from './api'
import { favoriteFailed, favoriteOf, rememberFavorite, requestFavorite } from './state'

defineOptions({ inheritAttrs: false })

// Saves or removes one course, teacher or resource. The state comes from one batched
// lookup per kind; while it is unknown the button stays disabled instead of guessing.
// `quiet` is for rows of a list, where the mark has no surface until it is pointed at or switched on.
const props = defineProps<{ kind: FavoriteKind; id: string; text?: boolean; quiet?: boolean }>()
const { t } = useI18n()
const errorText = useErrorText()
const api = useFavoritesApi()
const session = useSession()
const busy = ref(false)
const pop = ref(false)
const moving = ref(false)
const movingBusy = ref(false)
const folders = useAsync((signal) => api.allFolders(signal))
const folderName = (row: Pick<FolderRow, 'name' | 'is_default'>) => (row.is_default && !row.name ? t('favorites.defaultFolder') : row.name)

const current = computed(() => favoriteOf(props.kind, props.id))
const failed = computed(() => favoriteFailed(props.kind, props.id))
const on = computed(() => !!current.value)
const signedIn = computed(() => session.state.value === 'member')

watch(() => [props.kind, props.id, signedIn.value] as const, ([kind, id, member]) => {
  if (member) requestFavorite(api, kind, id)
}, { immediate: true })

async function add(folder?: string) {
  const item = await api.add({ kind: props.kind, target_id: props.id, ...(folder ? { folder_id: folder } : {}) }, crypto.randomUUID())
  rememberFavorite(props.kind, props.id, item)
  return item
}

function openFolderPicker() {
  if (!current.value) return
  moving.value = true
  void folders.reload()
}

function closeFolderPicker() {
  if (!movingBusy.value) moving.value = false
}

async function chooseFolder(target: FolderRow) {
  const saved = current.value
  if (!saved || movingBusy.value) return
  if (saved.folder_id === target.id) {
    moving.value = false
    return
  }
  movingBusy.value = true
  try {
    const moved = await api.move(saved.id, { folder_id: target.id, revision: saved.revision }, crypto.randomUUID())
    rememberFavorite(props.kind, props.id, moved)
    moving.value = false
    toast(t('favorites.movedTo', { p0: folderName(target) }))
  } catch (failure) {
    toast(errorText(errorCode(failure)))
  } finally {
    movingBusy.value = false
  }
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
  const item = current.value
  if (item === undefined) return
  busy.value = true
  try {
    if (item) {
      await api.remove(item.id, { revision: item.revision }, crypto.randomUUID())
      rememberFavorite(props.kind, props.id, null)
      // Undo restores the favorite in the folder it was in.
      toast(t('favorites.removed'), () => void add(item.folder_id).catch((failure) => toast(errorText(errorCode(failure)))))
    } else {
      await add()
      pop.value = true
      toast(
        t('favorites.saved'),
        () => {
          const saved = current.value
          if (saved) void api.remove(saved.id, { revision: saved.revision }, crypto.randomUUID()).then(() => rememberFavorite(props.kind, props.id, null)).catch((failure) => toast(errorText(errorCode(failure))))
        },
        { label: t('favorites.moveTo'), run: openFolderPicker },
      )
    }
  } catch (failure) {
    // The outcome may be unknown; read the server state again instead of assuming.
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
  <SheetDialog
    v-if="moving"
    :open="moving"
    :title="t('favorites.moveTo')"
    @close="closeFolderPicker"
  >
    <AsyncState
      :status="folders.status.value"
      :error="folders.error.value"
      @retry="folders.reload()"
    >
      <div class="stack-sm">
        <button
          v-for="row in folders.data.value ?? []"
          :key="row.id"
          class="btn row-between"
          type="button"
          :aria-pressed="current?.folder_id === row.id"
          :disabled="movingBusy"
          @click="void chooseFolder(row)"
        >
          <span class="row"><Folder aria-hidden="true" />{{ folderName(row) }}</span>
          <small class="subtle">{{ row.item_count }}</small>
        </button>
      </div>
    </AsyncState>
  </SheetDialog>
</template>
