<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-xl p-8 text-center" data-testid="share-invalid-page">
        <div class="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Icon name="mdi:link-off" class="w-8 h-8 text-amber-600" />
        </div>

        <h1 class="text-2xl font-bold text-gray-900" data-testid="share-invalid-heading">
          {{ reason === 'expired' ? 'This share link has expired' : 'This share link has been revoked or is no longer valid' }}
        </h1>

        <p class="text-sm text-gray-500 mt-3" data-testid="share-invalid-explanation">
          {{ reason === 'expired'
            ? 'The link you followed is no longer active. Ask the owner to create a new share link.'
            : 'The link you followed may have been revoked or was never valid. Ask the owner for a fresh share link.' }}
        </p>

        <NuxtLink to="/" class="btn-primary mt-6" data-testid="share-invalid-home">
          Go home
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const reason = String(route.query.reason || '')

useHead({
  title: reason === 'expired'
    ? 'Share link expired - VP Associates'
    : 'Share link invalid - VP Associates',
})
</script>
