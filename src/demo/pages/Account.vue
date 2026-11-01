<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Fingerprint, Laptop, MessageSquare, Phone, Smartphone } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import MeLayout from '../../features/account/MeLayout.vue'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { maskedIdentity, useVerification } from '../../features/verification/api'
import { toast } from '../store'
const { t: tr } = useI18n()

const verification = useVerification()
const identity = ref<boolean>()
const masked = ref<ReturnType<typeof maskedIdentity>>()
onMounted(async () => { try { const summary = await verification.get('Summary', '/api/v1/verification/summary'); identity.value = summary.identity_verified; masked.value = maskedIdentity(summary) } catch { identity.value = false } })
const qq = ref(true)
const unbind = ref(false)
const bindQQ = ref(false)
const phoneSheet = ref(false)
const phone = ref('')
const code = ref('')
const sent = ref(0)
const remove = ref(false)
const phrase = ref('')
const devices = ref([{ id: 'a', icon: Laptop, name: 'Windows · Chrome', at: tr('demo.currentDevice'), current: true }, { id: 'b', icon: Smartphone, name: 'iPhone · Safari', at: tr('demo.twoHoursAgo'), current: false }])
const phoneOk = computed(() => /^1\d{10}$/.test(phone.value))
const confirmPhrase = computed(() => tr('demo.confirmDeletion'))
function send() { sent.value = 60; const timer = setInterval(() => { if (--sent.value <= 0) clearInterval(timer) }, 1000); toast(tr('demo.codeSent')) }
function changePhone() { phoneSheet.value = false; toast(tr('demo.phoneChanged')); phone.value = ''; code.value = '' }
</script>

<template>
  <MeLayout :title="tr('demo.accountSecurity')" :description="tr('demo.accountDescription')">
    <section class="section">
      <h2 class="d-title">{{ tr('demo.identityBindings') }}</h2>
      <ul class="group">
        <li class="group-row has-icon">
          <span class="icon-tile" style="--tile:var(--c-green)"><Phone aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">{{ tr('demo.phone') }}</span><span class="group-detail">138****2046</span></span>
          <button class="btn btn-sm" type="button" @click="phoneSheet = true">{{ tr('demo.change') }}</button>
        </li>
        <li class="group-row has-icon">
          <span class="icon-tile" style="--tile:var(--c-indigo)"><Fingerprint aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">{{ tr('demo.identityVerification') }}</span><span v-if="identity === undefined" class="skeleton-tag" aria-hidden="true" /><span v-else class="group-detail">{{ identity ? (masked ? tr('demo.identityDoneMasked', { p0: masked.name, p1: masked.number }) : tr('demo.identityDone')) : tr('demo.identityPending') }}</span></span>
          <RouterLink v-if="identity !== undefined" class="btn btn-sm" :class="{ 'btn-primary': !identity }" to="/me/account/identity">{{ identity ? tr('demo.view') : tr('demo.goVerify') }}</RouterLink>
        </li>
        <li class="group-row has-icon">
          <span class="icon-tile" style="--tile:var(--c-cyan)"><MessageSquare aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">QQ</span><span class="group-detail">{{ qq ? tr('demo.qqBoundMasked') : tr('demo.qqBenefit') }}</span></span>
          <button v-if="qq" class="btn btn-sm" type="button" @click="unbind = true">{{ tr('demo.unbind') }}</button>
          <button v-else class="btn btn-sm btn-primary" type="button" @click="bindQQ = true">{{ tr('demo.bind') }}</button>
        </li>
      </ul>
    </section>
    <section class="section">
      <h2 class="d-title">{{ tr('demo.signedInDevices') }}</h2>
      <ul class="group">
        <li v-for="dev in devices" :key="dev.id" class="group-row has-icon">
          <span class="icon-tile" style="--tile:var(--c-gray)"><component :is="dev.icon" aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">{{ dev.name }}</span><span class="group-detail">{{ dev.at }}</span></span>
          <button v-if="!dev.current" class="btn btn-sm" type="button" @click="devices = devices.filter((x) => x.id !== dev.id); toast(tr('demo.deviceSignedOut'))">{{ tr('demo.signOutDevice') }}</button>
        </li>
      </ul>
    </section>
    <section class="section">
      <h2 class="d-title">{{ tr('demo.deletionSection') }}</h2>
      <div class="card row-between"><p class="muted small grow">{{ tr('demo.deletionHint') }}</p><button class="btn btn-sm btn-danger" type="button" @click="remove = true">{{ tr('demo.deleteAccount') }}</button></div>
    </section>

    <SheetDialog :open="phoneSheet" :title="tr('demo.changePhone')" :description="tr('demo.newPhoneHint')" @close="phoneSheet = false">
      <label class="field"><span class="field-label">{{ tr('demo.newPhone') }}</span><input v-model="phone" class="input" inputmode="tel" maxlength="11" :aria-invalid="!!phone && !phoneOk"><span v-if="phone && !phoneOk" class="field-error">{{ tr('demo.phoneInvalid') }}</span></label>
      <label class="field"><span class="field-label">{{ tr('demo.code') }}</span><span class="row nowrap"><input v-model="code" class="input" inputmode="numeric" maxlength="6"><button class="btn btn-sm send" type="button" :disabled="!phoneOk || sent > 0" @click="send">{{ sent ? tr('demo.resendIn', { p0: sent }) : tr('demo.getCode') }}</button></span></label>
      <div class="form-actions"><button class="btn btn-primary" type="button" :disabled="!phoneOk || code.length !== 6" @click="changePhone">{{ tr('demo.confirmChange') }}</button><button class="btn" type="button" @click="phoneSheet = false">{{ tr('demo.cancel') }}</button></div>
    </SheetDialog>
    <SheetDialog :open="bindQQ" :title="tr('demo.bindQq')" :description="tr('demo.bindQqHint')" @close="bindQQ = false">
      <p class="code">H7K2-9QXM</p><p class="subtle center">{{ tr('demo.bindCodeValid') }}</p>
      <div class="form-actions"><button class="btn btn-primary" type="button" @click="bindQQ = false; qq = true; toast(tr('demo.qqBound'))">{{ tr('demo.iHaveSent') }}</button></div>
    </SheetDialog>
    <ConfirmDialog :open="unbind" :title="tr('demo.unbindQqQ')" :message="tr('demo.unbindQqHint')" :confirm-label="tr('demo.unbind')" danger @confirm="unbind = false; qq = false; toast(tr('demo.qqUnbound'))" @cancel="unbind = false" />
    <SheetDialog :open="remove" :title="tr('demo.deleteAccount')" :description="tr('demo.deletionCooling')" @close="remove = false">
      <ul class="stack-sm muted small"><li>{{ tr('demo.ivoryCleared') }}</li><li>{{ tr('demo.verificationRecordKept') }}</li><li>{{ tr('demo.signedAnonymized') }}</li></ul>
      <label class="field"><span class="field-label">{{ tr('demo.typeToConfirm', { p0: confirmPhrase }) }}</span><input v-model="phrase" class="input"></label>
      <div class="form-actions"><button class="btn btn-danger" type="button" :disabled="phrase !== confirmPhrase" @click="remove = false; phrase = ''; toast(tr('demo.deletionSubmitted'))">{{ tr('demo.submitDeletion') }}</button><button class="btn" type="button" @click="remove = false">{{ tr('demo.cancel') }}</button></div>
    </SheetDialog>
  </MeLayout>
</template>

<style scoped>
.grow { flex: 1 1 14rem; }
.nowrap { flex-wrap: nowrap; }
.send { flex: none; }
.code { padding: 1rem; border-radius: var(--radius); background: var(--fill); font-family: var(--mono); font-size: 1.5rem; font-weight: 600; letter-spacing: .08em; text-align: center; }
.center { text-align: center; }
</style>
