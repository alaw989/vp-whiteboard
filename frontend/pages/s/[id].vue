<template>
  <div class="h-screen flex items-center justify-center bg-neutral-100">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p class="text-neutral-600">Redirecting...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const shortId = String((route.params as any).id || '')

useHead({ title: 'Redirecting...' })

// Resolve share link client-side — the server route handles first-load redirects,
// but client-side navigation to /s/:id goes through this page.
async function resolveShareLink() {
  if (!shortId) {
    await navigateTo('/', { redirectCode: 302 })
    return
  }

  try {
    const res = await $fetch<{ success: boolean; data?: { id: string } }>(
      `/api/sessions/${shortId}`
    )
    if (res.success && res.data?.id) {
      await navigateTo(`/whiteboard/${res.data.id}`, { redirectCode: 302 })
    } else {
      await navigateTo('/', { redirectCode: 302 })
    }
  } catch {
    await navigateTo('/', { redirectCode: 302 })
  }
}

if (import.meta.client) {
  resolveShareLink()
}
</script>
