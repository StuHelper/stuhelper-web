<script setup lang="ts">
import { Camera, Eye } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../store'

const saved = { nick: '小航同学', bio: '计算机学院 2023 级，喜欢写代码和拍飞机。', department: true, stage: false, reviews: true, resources: true }
const form = reactive({ ...saved })
const preview = ref(false)
const dirty = computed(() => (Object.keys(saved) as (keyof typeof saved)[]).some((k) => form[k] !== saved[k]))
function save() { Object.assign(saved, form); toast('个人资料已保存') }
</script>

<template>
  <MeLayout title="个人资料" description="昵称和头像在署名评价和资料中显示。匿名发布的内容不会关联到你。">
    <template #actions><button class="btn btn-sm" type="button" @click="preview = true"><Eye aria-hidden="true" />预览公开主页</button></template>
    <form class="stack-lg" @submit.prevent="save">
      <section class="card stack">
        <div class="row avatar-row">
          <button class="avatar" type="button" aria-label="更换头像" @click="toast('原型未接入图片上传')"><span aria-hidden="true">{{ [...form.nick][0] }}</span><i><Camera aria-hidden="true" /></i></button>
          <p class="subtle">JPG 或 PNG，不超过 2 MB。头像通过审核后对其他同学可见。</p>
        </div>
        <label class="field"><span class="field-label">昵称</span><input v-model="form.nick" class="input" maxlength="20"><span class="field-hint">{{ form.nick.length }}/20，每 30 天可修改一次。</span></label>
        <label class="field"><span class="field-label">个人简介</span><textarea v-model="form.bio" class="textarea" maxlength="120" /><span class="field-hint">{{ form.bio.length }}/120</span></label>
      </section>
      <section class="section">
        <h2 class="d-title">公开主页显示</h2>
        <div class="card stack">
          <label class="check"><input v-model="form.department" type="checkbox"><span>学院</span></label>
          <label class="check"><input v-model="form.stage" type="checkbox"><span>年级</span></label>
          <label class="check"><input v-model="form.reviews" type="checkbox"><span>署名评价</span></label>
          <label class="check"><input v-model="form.resources" type="checkbox"><span>上传的资料</span></label>
        </div>
      </section>
      <div class="form-actions save"><button class="btn btn-primary" :disabled="!dirty || !form.nick.trim()" type="submit">保存</button><span v-if="dirty" class="subtle">有未保存的修改</span></div>
    </form>
    <SheetDialog :open="preview" title="公开主页预览" description="其他同学看到的样子" @close="preview = false">
      <div class="row avatar-row"><span class="avatar still" aria-hidden="true">{{ [...form.nick][0] }}</span><div class="group-body"><b>{{ form.nick }}</b><span class="subtle">{{ [form.department ? '计算机学院' : '', form.stage ? '2023 级' : ''].filter(Boolean).join(' · ') || '北京航空航天大学' }}</span></div></div>
      <p class="muted small">{{ form.bio }}</p>
      <ul class="group">
        <li v-if="form.reviews" class="group-row"><span class="group-body"><span class="group-title">署名评价</span><span class="group-detail">适合想做项目的同学</span></span></li>
        <li v-if="form.resources" class="group-row"><span class="group-body"><span class="group-title">上传的资料</span><span class="group-detail">自动控制原理重点公式速查</span></span></li>
      </ul>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.avatar-row { flex-wrap: nowrap; gap: 1rem; }
.avatar { position: relative; display: grid; flex: none; place-items: center; width: 72px; height: 72px; border: 0; border-radius: 50%; background: linear-gradient(145deg, #5e9cff, #0071e3); color: #fff; font: inherit; font-size: 1.75rem; font-weight: 600; cursor: pointer; }
.avatar.still { width: 56px; height: 56px; font-size: 1.375rem; }
.avatar i { position: absolute; inset-block-end: -2px; inset-inline-end: -2px; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--surface-raised); box-shadow: var(--shadow-card); color: var(--label); }
.avatar i svg { width: 14px; height: 14px; }
.save { position: sticky; inset-block-end: calc(var(--tab-height) + 1rem); }
@media (min-width: 761px) { .save { position: static; } }
</style>
