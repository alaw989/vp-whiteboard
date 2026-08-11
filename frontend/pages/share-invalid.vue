<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="bg-white rounded-2xl shadow-xl p-8 text-center" data-testid="share-invalid-page">
        <div class="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Icon name="mdi:link-off" class="w-8 h-8 text-amber-600" />
        </div>

        <h1 class="text-2xl font-bold text-gray-900" data-testid="share-invalid-heading">
          {{ heading }}
        </h1>

        <p class="text-sm text-gray-500 mt-3" data-testid="share-invalid-explanation">
          {{ explanation }}
        </p>

        <NuxtLink to="/" class="btn-primary mt-6" data-testid="share-invalid-home">
          {{ reason === 'rate_limited' ? 'Try again' : 'Go home' }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const reason = String(route.query.reason || '')

const heading = computed(() => {
  if (reason === 'expired') return 'This share link has expired'
  if (reason === 'rate_limited') return 'Too many attempts — please wait a minute and try again'
  return 'This share link has been revoked or is no longer valid'
})

const explanation = computed(() => {
  if (reason === 'expired') {
    return 'The link you followed is no longer active. Ask the owner to create a new share link.'
  }
  if (reason === 'rate_limited') {
    return 'The server received too many requests from this link in a short time. Wait a moment and try the link again.'
  }
  return 'The link you followed may have been revoked or was never valid. Ask the owner for a fresh share link.'
})

useHead({
  title: computed(() => reason === 'expired'
    ? 'Share link expired - VP Associates'
    : reason === 'rate_limited'
      ? 'Share link busy - VP Associates'
      : 'Share link invalid - VP Associates'),
})
</script>
