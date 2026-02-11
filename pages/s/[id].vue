<template>
  <div class="h-screen flex items-center justify-center bg-neutral-100">
    <div v-if="pending" class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p class="text-neutral-600">Loading session...</p>
    </div>

    <div v-else-if="error || !session" class="text-center bg-white rounded-xl shadow-lg p-8 max-w-md mx-4">
      <Icon name="mdi:alert-circle" class="w-16 h-16 text-red-500 mx-auto mb-4" />
      <h2 class="text-xl font-semibold text-gray-900 mb-2">Session Not Found</h2>
      <p class="text-gray-600 mb-6">
        The session you are looking for does not exist or has expired.
      </p>
      <NuxtLink to="/" class="btn-primary">
        <Icon name="mdi:home" class="w-4 h-4 mr-2" />
        Go Home
      </NuxtLink>
    </div>

    <div v-else class="text-center">
      <p class="text-neutral-600">Redirecting to session...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Session } from '~/types'

const route = useRoute()
const shortId = route.params.id as string

const { data, pending, error } = await useFetch<ApiResponse<Session>>(`/api/session/${shortId}`)
const session = computed(() => data.value?.success ? data.value.data : null)

// Redirect when session is loaded
watchEffect(() => {
  if (session.value) {
    navigateTo(`/whiteboard/${session.value.id}`, { replace: true })
  }
})

useHead({
  title: computed(() => session.value?.name || 'Loading Session...'),
})
</script>
