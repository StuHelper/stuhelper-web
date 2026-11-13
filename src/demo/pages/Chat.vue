<script setup lang="ts">
import { SendHorizontal } from 'lucide-vue-next'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MeLayout from '../../features/account/MeLayout.vue'
import NotFoundView from '../../features/home/NotFoundView.vue'
import { useFormat } from '../../app/i18n'
import { extras } from '../../shared/extras'
import { chats, chatThreads } from '../chat'

// 示例会话页：消息气泡和输入框。发送的消息只追加到当前页面的数据里。
const props = defineProps<{ id: string }>()
const { t: tr } = useI18n()
const format = useFormat()
const chat = computed(() => chats.find((item) => item.id === props.id))
const draft = ref('')
const end = ref<HTMLElement>()
const sync = () => { extras.threads.splice(0, extras.threads.length, ...chatThreads()) }
async function send() {
  const text = draft.value.trim()
  if (!text || !chat.value) return
  chat.value.messages.push({ id: `${chat.value.id}-${Date.now()}`, from: '小航同学', mine: true, text, at: new Date().toISOString() })
  draft.value = ''
  sync()
  await nextTick()
  end.value?.scrollIntoView({ block: 'end', behavior: 'smooth' })
}
onMounted(() => {
  // 打开会话即视为已读。
  if (chat.value) { chat.value.unread = 0; sync() }
})
</script>

<template>
  <NotFoundView v-if="!chat" />
  <MeLayout v-else :title="chat.name" :description="chat.kind === 'group' ? tr('demo.chatGroup', { p0: chat.members }) : tr('demo.chatDirect')" back="/notifications" :back-label="tr('notifications.title')">
    <p class="notice notice-info small">{{ tr('demo.chatSample') }}</p>
    <ol class="chat card">
      <li v-for="message in chat.messages" :key="message.id" class="line" :class="{ mine: message.mine }">
        <span v-if="!message.mine" class="who" aria-hidden="true">{{ [...message.from][0] }}</span>
        <div class="bubble-wrap">
          <span v-if="chat.kind === 'group' && !message.mine" class="from subtle">{{ message.from }}</span>
          <p class="bubble">{{ message.text }}</p>
          <time class="subtle at" :datetime="message.at">{{ format.dateTime(message.at) }}</time>
        </div>
      </li>
      <li ref="end" aria-hidden="true" />
    </ol>
    <form class="composer" @submit.prevent="send">
      <input v-model="draft" class="input" type="text" maxlength="500" :aria-label="tr('demo.chatPlaceholder')" :placeholder="tr('demo.chatPlaceholder')">
      <button class="btn btn-primary btn-icon send" type="submit" :disabled="!draft.trim()" :aria-label="tr('demo.chatSend')"><SendHorizontal aria-hidden="true" /></button>
    </form>
  </MeLayout>
</template>

<style scoped>
.chat { display: grid; gap: .875rem; padding-block: 1.25rem; }
.line { display: flex; align-items: flex-end; gap: .5rem; animation: line-in .35s var(--ease-out) both; }
.line.mine { justify-content: flex-end; }
@keyframes line-in { from { opacity: 0; transform: translateY(8px); } }
.who { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(145deg, #8ea2ff, #5b6cf0); color: #fff; font-size: .8125rem; font-weight: 650; }
.bubble-wrap { display: grid; gap: .125rem; max-width: min(34rem, 78%); }
.mine .bubble-wrap { justify-items: end; }
.from { font-size: .75rem; }
.bubble { padding: .5rem .875rem; border-radius: 20px; border-end-start-radius: 6px; background: var(--fill); font-size: .9375rem; line-height: 1.5; overflow-wrap: anywhere; }
.mine .bubble { border-end-start-radius: 20px; border-end-end-radius: 6px; background: var(--accent-fill) linear-gradient(180deg, rgb(255 255 255 / 16%), transparent 62%); color: #fff; }
.at { font-size: .6875rem; }
/* 输入区是悬浮的玻璃胶囊，停在页面底部、手机标签栏的上方。 */
.composer { position: sticky; inset-block-end: 1rem; display: flex; align-items: center; gap: .5rem; padding: .375rem; border-radius: var(--pill); background: var(--glass); box-shadow: var(--glass-edge), var(--glass-shadow); backdrop-filter: var(--glass-filter); -webkit-backdrop-filter: var(--glass-filter); }
.composer .input { min-height: 42px; border-radius: var(--pill); background: transparent; }
.composer .input:focus { box-shadow: none; }
.send { width: 42px; min-height: 42px; }
@media (max-width: 760px) { .composer { inset-block-end: calc(var(--tab-height) + var(--safe-bottom) + .5rem); } }
</style>
