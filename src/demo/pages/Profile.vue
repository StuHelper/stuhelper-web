<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Camera, Eye } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../store'
const { t: tr } = useI18n()

const saved = { nick: '小航同学', bio: '计算机学院 2023 级，喜欢写代码和拍飞机。', department: true, stage: false, reviews: true, resources: true }
const form = reactive({ ...saved })
const preview = ref(false)
const dirty = computed(() => (Object.keys(saved) as (keyof typeof saved)[]).some((k) => form[k] !== saved[k]))
function save() { Object.assign(saved, form); toast(tr('demo.profileSaved')) }
</script>

<template>
  <MeLayout :title="tr('demo.profile')" :description="tr('demo.profileDescription')">
    <template #actions><button class="btn btn-sm" type="button" @click="preview = true"><Eye aria-hidden="true" />{{ tr('demo.previewProfile') }}</button></template>
    <form class="stack-lg" @submit.prevent="save">
      <section class="card stack">
        <div class="row avatar-row">
          <button class="avatar" type="button" :aria-label="tr('demo.changeAvatar')" @click="toast(tr('demo.imageUploadMissing'))"><span aria-hidden="true">{{ [...form.nick][0] }}</span><i><Camera aria-hidden="true" /></i></button>
          <p class="subtle">{{ tr('demo.avatarHint') }}</p>
        </div>
        <label class="field"><span class="field-label">{{ tr('demo.nickname') }}</span><input v-model="form.nick" class="input" maxlength="20"><span class="field-hint">{{ tr('demo.nickHint', { p0: form.nick.length }) }}</span></label>
        <label class="field"><span class="field-label">{{ tr('demo.bio') }}</span><textarea v-model="form.bio" class="textarea" maxlength="120" /><span class="field-hint">{{ form.bio.length }}/120</span></label>
      </section>
      <section class="section">
        <h2 class="d-title">{{ tr('demo.publicProfileShows') }}</h2>
        <div class="card stack">
          <label class="check"><input v-model="form.department" type="checkbox"><span>{{ tr('demo.department') }}</span></label>
          <label class="check"><input v-model="form.stage" type="checkbox"><span>{{ tr('demo.grade') }}</span></label>
          <label class="check"><input v-model="form.reviews" type="checkbox"><span>{{ tr('demo.signedReviews') }}</span></label>
          <label class="check"><input v-model="form.resources" type="checkbox"><span>{{ tr('demo.uploadedResources') }}</span></label>
        </div>
      </section>
      <div class="form-actions save"><button class="btn btn-primary" :disabled="!dirty || !form.nick.trim()" type="submit">{{ tr('demo.save') }}</button><span v-if="dirty" class="subtle">{{ tr('demo.unsavedChanges') }}</span></div>
    </form>
    <SheetDialog :open="preview" :title="tr('demo.publicProfilePreview')" :description="tr('demo.asOthersSee')" @close="preview = false">
      <div class="row avatar-row"><span class="avatar still" aria-hidden="true">{{ [...form.nick][0] }}</span><div class="group-body"><b>{{ form.nick }}</b><span class="subtle">{{ [form.department ? '计算机学院' : '', form.stage ? '2023 级' : ''].filter(Boolean).join(' · ') || tr('demo.beihang') }}</span></div></div>
      <p class="muted small">{{ form.bio }}</p>
      <ul class="group">
        <li v-if="form.reviews" class="group-row"><span class="group-body"><span class="group-title">{{ tr('demo.signedReviews') }}</span><span class="group-detail">适合想做项目的同学</span></span></li>
        <li v-if="form.resources" class="group-row"><span class="group-body"><span class="group-title">{{ tr('demo.uploadedResources') }}</span><span class="group-detail">自动控制原理重点公式速查</span></span></li>
      </ul>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.avatar-row { flex-wrap: nowrap; gap: 1rem; }
.avatar { position: relative; display: grid; flex: none; place-items: center; width: 72px; height: 72px; border: 0; border-radius: 50%; background: linear-gradient(145deg, #5e9cff, var(--c-blue)); color: #fff; font: inherit; font-size: 1.75rem; font-weight: 600; cursor: pointer; }
.avatar.still { width: 56px; height: 56px; font-size: 1.375rem; }
.avatar i { position: absolute; inset-block-end: -2px; inset-inline-end: -2px; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--surface-raised); box-shadow: var(--shadow-card); color: var(--label); }
.avatar i svg { width: 14px; height: 14px; }
.save { position: sticky; inset-block-end: calc(var(--tab-height) + 1rem); }
@media (min-width: 761px) { .save { position: static; } }
</style>
