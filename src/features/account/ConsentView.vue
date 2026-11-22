<script setup lang="ts">
import RequireSignIn from './RequireSignIn.vue'
import ConsentGate from './ConsentGate.vue'

// The consent page reached from the account menu. A signed-in account with nothing left to
// accept sees which versions it accepted and when.
</script>

<template>
  <div>
    <RequireSignIn>
      <ConsentGate />
    </RequireSignIn>
  </div>
</template>
