<script setup lang="ts">
import { MoreHorizontal } from 'lucide-vue-next'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import type { Component } from 'vue'
defineProps<{ label: string; items: { label: string; icon: Component; action: () => void }[] }>()
</script>
<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger class="btn btn-sm btn-icon d-row-more" :aria-label="label"><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu" align="end" :side-offset="6">
        <DropdownMenuItem v-for="item in items" :key="item.label" class="menu-item" @select="item.action()"><component :is="item.icon" aria-hidden="true" />{{ item.label }}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
