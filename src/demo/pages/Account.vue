<script setup lang="ts">
import { Laptop, MessageSquare, Phone, Smartphone, UsersRound } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import MeLayout from '../../features/account/MeLayout.vue'
import ConfirmDialog from '../../shared/ui/ConfirmDialog.vue'
import SheetDialog from '../../shared/ui/SheetDialog.vue'
import { toast } from '../store'

const qq = ref(true)
const unbind = ref(false)
const bindQQ = ref(false)
const phoneSheet = ref(false)
const phone = ref('')
const code = ref('')
const sent = ref(0)
const remove = ref(false)
const phrase = ref('')
const groups = ref([{ name: '北航 2026 秋 数据结构答疑群', state: 'joined' }, { name: '北航 StuHelper 反馈群', state: 'can' }])
const devices = ref([{ id: 'a', icon: Laptop, name: 'Windows · Chrome', at: '当前设备', current: true }, { id: 'b', icon: Smartphone, name: 'iPhone · Safari', at: '2 小时前', current: false }])
const phoneOk = computed(() => /^1\d{10}$/.test(phone.value))
function send() { sent.value = 60; const timer = setInterval(() => { if (--sent.value <= 0) clearInterval(timer) }, 1000); toast('验证码已发送（演示）') }
function changePhone() { phoneSheet.value = false; toast('手机号已更换'); phone.value = ''; code.value = '' }
</script>

<template>
  <MeLayout title="账号与绑定" description="登录方式、QQ 群和设备都在这里管理。">
    <section class="section">
      <h2 class="d-title">绑定</h2>
      <ul class="group">
        <li class="group-row has-icon">
          <span class="icon-tile" style="--tile:#34c759"><Phone aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">手机号</span><span class="group-detail">138****2046</span></span>
          <button class="btn btn-sm" type="button" @click="phoneSheet = true">更换</button>
        </li>
        <li class="group-row has-icon">
          <span class="icon-tile" style="--tile:#32ade6"><MessageSquare aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">QQ</span><span class="group-detail">{{ qq ? '已绑定 · 12****89' : '绑定后可以在群里查询课程和接收提醒' }}</span></span>
          <button v-if="qq" class="btn btn-sm" type="button" @click="unbind = true">解绑</button>
          <button v-else class="btn btn-sm btn-primary" type="button" @click="bindQQ = true">绑定</button>
        </li>
      </ul>
    </section>
    <section v-if="qq" class="section">
      <h2 class="d-title">QQ 群</h2>
      <ul class="group">
        <li v-for="g in groups" :key="g.name" class="group-row has-icon">
          <span class="icon-tile" style="--tile:#5856d6"><UsersRound aria-hidden="true" /></span>
          <span class="group-body group-title">{{ g.name }}</span>
          <span v-if="g.state === 'joined'" class="tag tag-success">已加入</span>
          <span v-else-if="g.state === 'pending'" class="tag tag-info">等待审批</span>
          <button v-else class="btn btn-sm btn-primary" type="button" @click="g.state = 'pending'; toast('入群申请已提交')">申请加入</button>
        </li>
      </ul>
    </section>
    <section class="section">
      <h2 class="d-title">登录设备</h2>
      <ul class="group">
        <li v-for="dev in devices" :key="dev.id" class="group-row has-icon">
          <span class="icon-tile" style="--tile:#8e8e93"><component :is="dev.icon" aria-hidden="true" /></span>
          <span class="group-body"><span class="group-title">{{ dev.name }}</span><span class="group-detail">{{ dev.at }}</span></span>
          <button v-if="!dev.current" class="btn btn-sm" type="button" @click="devices = devices.filter((x) => x.id !== dev.id); toast('已退出该设备')">退出</button>
        </li>
      </ul>
    </section>
    <section class="section">
      <h2 class="d-title">注销</h2>
      <div class="card row-between"><p class="muted small grow">注销后个人信息会被删除，已发布的匿名内容继续保留。</p><button class="btn btn-sm btn-danger" type="button" @click="remove = true">注销账号</button></div>
    </section>

    <SheetDialog :open="phoneSheet" title="更换手机号" description="新手机号用于登录和接收安全提醒。" @close="phoneSheet = false">
      <label class="field"><span class="field-label">新手机号</span><input v-model="phone" class="input" inputmode="tel" maxlength="11" :aria-invalid="!!phone && !phoneOk"><span v-if="phone && !phoneOk" class="field-error">请输入 11 位手机号。</span></label>
      <label class="field"><span class="field-label">验证码</span><span class="row nowrap"><input v-model="code" class="input" inputmode="numeric" maxlength="6"><button class="btn btn-sm send" type="button" :disabled="!phoneOk || sent > 0" @click="send">{{ sent ? `${sent} 秒后重发` : '获取验证码' }}</button></span></label>
      <div class="form-actions"><button class="btn btn-primary" type="button" :disabled="!phoneOk || code.length !== 6" @click="changePhone">确认更换</button><button class="btn" type="button" @click="phoneSheet = false">取消</button></div>
    </SheetDialog>
    <SheetDialog :open="bindQQ" title="绑定 QQ" description="用手机 QQ 扫码或向机器人发送下面的绑定码。" @close="bindQQ = false">
      <p class="code">H7K2-9QXM</p><p class="subtle center">绑定码 10 分钟内有效</p>
      <div class="form-actions"><button class="btn btn-primary" type="button" @click="bindQQ = false; qq = true; toast('QQ 已绑定')">我已发送</button></div>
    </SheetDialog>
    <ConfirmDialog :open="unbind" title="解绑 QQ？" message="解绑后机器人不再回应你的查询，你也可能被移出需要认证的群。" confirm-label="解绑" danger @confirm="unbind = false; qq = false; toast('QQ 已解绑')" @cancel="unbind = false" />
    <SheetDialog :open="remove" title="注销账号" description="这个操作提交后有 7 天冷静期，期间登录可以撤销。" @close="remove = false">
      <ul class="stack-sm muted small"><li>Ivory 余额会被清零，未完成的退款继续处理。</li><li>学生认证记录按规定保留后删除。</li><li>署名内容会改为匿名显示。</li></ul>
      <label class="field"><span class="field-label">输入“确认注销”继续</span><input v-model="phrase" class="input"></label>
      <div class="form-actions"><button class="btn btn-danger" type="button" :disabled="phrase !== '确认注销'" @click="remove = false; phrase = ''; toast('注销申请已提交（演示）')">提交注销</button><button class="btn" type="button" @click="remove = false">取消</button></div>
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
