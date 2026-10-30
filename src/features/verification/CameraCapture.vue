<script setup lang="ts">
import QRCode from 'qrcode'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useFormat } from '../../app/i18n'
import { ApiError, errorCode } from '../../shared/api/errors'
import { useErrorText } from '../../shared/ui/messages'
import { useVerification, type Material } from './api'

// Live capture of verification material on this device or, through a
// single-use link, on a phone. Files cannot be picked from storage on purpose.
const props = withDefaults(defineProps<{ applicationId?: string; ticket?: string }>(), { applicationId: undefined, ticket: undefined })
const emit = defineEmits<{ captured: [material: Material] }>()
const { t } = useI18n()
const format = useFormat()
const errorText = useErrorText()
const api = useVerification()
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
let generation = 0

function stop() {
  generation++
  stream?.getTracks().forEach((track) => track.stop())
  stream = undefined
  active.value = false
}

function clearPreview() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  photo = undefined
}

async function start() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  stop()
  const current = generation
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    // A newer start or stop happened while the permission prompt was open.
    if (current !== generation || !video.value) {
      acquired.getTracks().forEach((track) => track.stop())
      return
    }
    stream = acquired
    video.value.srcObject = stream
    await video.value.play()
    if (current !== generation) return
    active.value = true
    clearPreview()
  } catch {
    if (current === generation) {
      stop()
      error.value = 'camera_unavailable'
    }
  } finally {
    busy.value = false
  }
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
    // Reduce JPEG quality until the photo fits the 1 MiB upload limit.
    let quality = 0.85
    let blob: Blob | null = null
    do {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      quality -= 0.15
    } while (blob && blob.size > 1 << 20 && quality > 0.2)
    if (!blob || blob.size > 1 << 20) throw new Error('camera')
    clearPreview()
    photo = blob
    preview.value = URL.createObjectURL(blob)
    stop()
  } catch {
    error.value = 'camera_unavailable'
  } finally {
    busy.value = false
  }
}

async function captureToken() {
  if (props.ticket) return props.ticket
  if (!props.applicationId) throw new ApiError('invalid_input')
  return (await api.write('CaptureSession', `/api/v1/verification/applications/${encodeURIComponent(props.applicationId)}/capture`)).token
}

async function upload() {
  if (!photo || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const material = await api.upload(await captureToken(), photo)
    clearPreview()
    emit('captured', material)
  } catch (failure) {
    error.value = errorCode(failure)
  } finally {
    busy.value = false
  }
}

async function phone() {
  if (!props.applicationId || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const session = await api.write('CaptureSession', `/api/v1/verification/applications/${encodeURIComponent(props.applicationId)}/capture`)
    // The token travels in the fragment so it is not sent to servers or logs.
    const target = new URL('/verification/capture', location.origin)
    target.hash = session.token
    link.value = target.toString()
    expires.value = session.expires_at
    qr.value = await QRCode.toDataURL(link.value, { width: 240, margin: 2, errorCorrectionLevel: 'M' })
  } catch (failure) {
    error.value = errorCode(failure)
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  stop()
  clearPreview()
})
</script>

<template>
  <section
    class="camera stack"
    :aria-label="t('verification.capture.label')"
  >
    <p class="small muted">
      {{ t('verification.capture.help') }}
    </p>
    <p
      v-if="error"
      class="notice notice-error"
      role="alert"
    >
      {{ error === 'camera_unavailable' ? t('verification.capture.unavailable') : errorText(error) }}
    </p>
    <video
      v-show="active"
      ref="video"
      playsinline
      muted
      :aria-label="t('verification.capture.preview')"
    />
    <img
      v-if="preview"
      :src="preview"
      :alt="t('verification.capture.photo')"
    >
    <div class="row">
      <button
        v-if="!active && !preview"
        class="btn"
        type="button"
        :disabled="busy"
        @click="start"
      >
        {{ t('verification.capture.start') }}
      </button>
      <button
        v-if="active"
        class="btn btn-primary"
        type="button"
        :disabled="busy"
        @click="take"
      >
        {{ t('verification.capture.take') }}
      </button>
      <button
        v-if="active"
        class="btn"
        type="button"
        @click="stop"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        v-if="preview"
        class="btn"
        type="button"
        :disabled="busy"
        @click="start"
      >
        {{ t('verification.capture.retake') }}
      </button>
      <button
        v-if="preview"
        class="btn btn-primary"
        type="button"
        :disabled="busy"
        @click="upload"
      >
        {{ t('verification.capture.use') }}
      </button>
      <button
        v-if="applicationId"
        class="btn btn-ghost"
        type="button"
        :disabled="busy"
        @click="phone"
      >
        {{ t('verification.capture.phone') }}
      </button>
    </div>
    <div
      v-if="qr"
      class="phone-ticket stack-sm"
    >
      <img
        :src="qr"
        :alt="t('verification.capture.scan')"
        width="200"
        height="200"
      >
      <p class="subtle">
        {{ t('verification.capture.ticketExpiry', { time: format.dateTime(expires) }) }}
      </p>
      <a
        :href="link"
        target="_blank"
        rel="noreferrer"
      >{{ t('verification.capture.open') }}</a>
    </div>
  </section>
</template>

<style scoped>
.camera { padding: 1rem; border-radius: var(--radius-lg); background: var(--fill); }
.camera video, .camera > img { display: block; width: 100%; max-height: 24rem; border-radius: var(--radius); background: #000; object-fit: contain; }
.phone-ticket img { border-radius: var(--radius); background: #fff; }
</style>
