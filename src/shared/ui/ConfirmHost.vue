<script setup lang="ts">
import ConfirmDialog from './ConfirmDialog.vue'
import { answerConfirm, question } from './confirm'
</script>

<template>
  <ConfirmDialog
    :open="!!question"
    :title="question?.message ?? ''"
    @confirm="answerConfirm(true)"
    @cancel="answerConfirm(false)"
  />
</template>
