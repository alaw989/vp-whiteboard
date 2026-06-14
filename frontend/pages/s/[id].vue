<template>
  <div class="h-screen flex items-center justify-center bg-neutral-100">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p class="text-neutral-600">Redirecting...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Redirecting...' })
</script>
