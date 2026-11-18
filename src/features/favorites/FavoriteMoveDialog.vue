<script setup lang="ts">
import { Folder } from 'lucide-vue-next'
import { onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ApiError, errorCode } from '../../shared/api/errors'
import { useAsync } from '../../shared/composables/async'
import AsyncState from '../../shared/ui/AsyncState.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { useErrorText } from '../../shared/ui/messages'
import { toast } from '../../shared/ui/toast'
import { useFavoritesApi, type Favorite, type Folder as FolderRow } from './api'
import { rememberFavorite } from './state'

const props = defineProps<{ item: Favorite }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const errorText = useErrorText()
const api = useFavoritesApi()
const moving = ref(false)
let active = true
onScopeDispose(() => { active = false })

const choices = useAsync(async signal => {
  const { kind, target_id: target } = props.item
  const [folders, found] = await Promise.all([api.allFolders(signal), api.lookup(kind, [target], signal)])
  const item = found.get(target)
  if (!signal.aborted) rememberFavorite(kind, target, item ?? null)
  if (!item || item.id !== props.item.id) throw new ApiError('not_found')
  return { folders, item }
})
void choices.reload()
const folderName = (row: FolderRow) => row.is_default && !row.name ? t('favorites.defaultFolder') : row.name

async function chooseFolder(folder: FolderRow) {
  const saved = choices.data.value?.item
  if (!saved || moving.value) return
  if (saved.folder_id === folder.id) { emit('close'); return }
  moving.value = true
  try {
    const result = await api.move(saved.id, { folder_id: folder.id, revision: saved.revision }, crypto.randomUUID())
    if (!active) return
    rememberFavorite(result.kind, result.target_id, result)
    emit('close')
    toast(t('favorites.movedTo', { p0: folderName(folder) }))
  } catch (failure) {
    if (!active) return
    toast(errorText(errorCode(failure)))
    // The server may have committed the move before the response was lost.
    await choices.reload()
  } finally {
    moving.value = false
  }
}
</script>

<template>
  <SheetDialog
    open
    :title="t('favorites.moveTo')"
    @close="!moving && emit('close')"
  >
    <AsyncState
      :status="choices.status.value"
      :error="choices.error.value"
      @retry="choices.reload()"
    >
      <div class="stack-sm">
        <button
          v-for="row in choices.data.value?.folders ?? []"
          :key="row.id"
          class="btn row-between"
          type="button"
          :aria-pressed="choices.data.value?.item.folder_id === row.id"
          :disabled="moving"
          @click="chooseFolder(row)"
        >
          <span class="row"><Folder aria-hidden="true" />{{ folderName(row) }}</span>
          <small class="subtle">{{ row.item_count }}</small>
        </button>
      </div>
    </AsyncState>
  </SheetDialog>
</template>
