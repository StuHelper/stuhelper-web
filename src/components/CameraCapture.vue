<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { verification, VerificationError, type Schemas } from '../api/verification'

const props = defineProps<{ applicationId?: string; ticket?: string }>()
const emit = defineEmits<{ captured: [material: Schemas['Material']] }>()
const { t, d } = useI18n()
const video = ref<HTMLVideoElement>()
const active = ref(false)
const busy = ref(false)
const error = ref('')
const preview = ref('')
const qr = ref('')
const link = ref('')
const expires = ref('')
let stream: MediaStream | undefined
let photo: Blob | undefined
function stop() { stream?.getTracks().forEach(track => track.stop()); stream = undefined; active.value = false }
function clearPreview() { if (preview.value) URL.revokeObjectURL(preview.value); preview.value = ''; photo = undefined }
async function start() {
  error.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    if (!video.value) { stop(); return }
    video.value.srcObject = stream
    await video.value.play()
    active.value = true
    clearPreview()
  } catch { stop(); error.value = 'camera_unavailable' }
}
async function take() {
  if (!video.value?.videoWidth || busy.value) return
  busy.value = true
  try {
    const canvas = document.createElement('canvas')
    const ratio = Math.min(1, 1600 / video.value.videoWidth, 1600 / video.value.videoHeight)
    canvas.width = Math.round(video.value.videoWidth * ratio)
    canvas.height = Math.round(video.value.videoHeight * ratio)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('camera')
    context.drawImage(video.value, 0, 0, canvas.width, canvas.height)
    let quality = 0.85
    let blob: Blob | null = null
    do {
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      quality -= 0.15
    } while (blob && blob.size > 1 << 20 && quality > 0.2)
    if (!blob || blob.size > 1 << 20) throw new Error('camera')
    clearPreview(); photo = blob; preview.value = URL.createObjectURL(blob); stop()
  } catch { error.value = 'camera_unavailable' } finally { busy.value = false }
}
async function captureTicket() {
  if (props.ticket) return props.ticket
  if (!props.applicationId) throw new VerificationError('invalid_input')
  return (await verification.write('CaptureSession', `/api/v1/verification/applications/${props.applicationId}/capture`)).token
}
async function upload() {
  if (!photo || busy.value) return
  busy.value = true; error.value = ''
  try { const material = await verification.upload(await captureTicket(), photo); clearPreview(); emit('captured', material) }
  catch (e) { error.value = e instanceof VerificationError ? e.code : 'network' }
  finally { busy.value = false }
}
async function phone() {
  if (!props.applicationId || busy.value) return
  busy.value = true; error.value = ''
  try {
    const session = await verification.write('CaptureSession', `/api/v1/verification/applications/${props.applicationId}/capture`)
    const target = new URL('/verification/capture', location.origin)
    target.hash = session.token
    link.value = target.toString(); expires.value = session.expires_at
    qr.value = await QRCode.toDataURL(link.value, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
  } catch (e) { error.value = e instanceof VerificationError ? e.code : 'network' }
  finally { busy.value = false }
}
onBeforeUnmount(() => { stop(); clearPreview() })
</script>

<template>
  <section
    class="camera-box"
    :aria-label="t('verification.camera')"
  >
    <p>{{ t('verification.cameraHelp') }}</p>
    <p
      v-if="error"
      role="alert"
    >
      {{ t(`verification.errors.${error}`) }}
    </p>
    <video
      v-show="active"
      ref="video"
      playsinline
      muted
      :aria-label="t('verification.cameraPreview')"
    />
    <img
      v-if="preview"
      :src="preview"
      :alt="t('verification.photoPreview')"
    >
    <div class="camera-actions">
      <button
        v-if="!active && !preview"
        type="button"
        :disabled="busy"
        @click="start"
      >
        {{ t('verification.startCamera') }}
      </button>
      <button
        v-if="active"
        type="button"
        :disabled="busy"
        @click="take"
      >
        {{ t('verification.takePhoto') }}
      </button>
      <button
        v-if="active"
        type="button"
        @click="stop"
      >
        {{ t('verification.cancel') }}
      </button>
      <button
        v-if="preview"
        type="button"
        :disabled="busy"
        @click="start"
      >
        {{ t('verification.retake') }}
      </button>
      <button
        v-if="preview"
        type="button"
        :disabled="busy"
        @click="upload"
      >
        {{ t('verification.usePhoto') }}
      </button>
      <button
        v-if="applicationId"
        type="button"
        :disabled="busy"
        @click="phone"
      >
        {{ t('verification.usePhone') }}
      </button>
    </div>
    <div
      v-if="qr"
      class="phone-ticket"
    >
      <img
        :src="qr"
        :alt="t('verification.scanPhone')"
        width="240"
        height="240"
      >
      <p>{{ t('verification.ticketExpiry') }} {{ d(new Date(expires), 'dateTime') }}</p>
      <a
        :href="link"
        target="_blank"
        rel="noreferrer"
      >{{ t('verification.openCamera') }}</a>
    </div>
  </section>
</template>

<style scoped>
.camera-box { padding: 1rem; border: 1px solid var(--border); border-radius: .6rem; }
.camera-box video, .camera-box > img { display: block; width: 100%; max-height: 22rem; object-fit: contain; background: var(--surface); border-radius: .4rem; }
.camera-actions { display: flex; flex-wrap: wrap; gap: .6rem; margin-block-start: .8rem; }
.phone-ticket { margin-block-start: 1rem; overflow-wrap: anywhere; }
.phone-ticket img { max-width: 100%; }
</style>
