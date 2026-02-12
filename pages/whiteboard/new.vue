<script setup lang="ts">
// Create a new whiteboard and redirect to it
const router = useRouter()

// Simple user ID for creating whiteboards (in production, this comes from auth)
const createUserId = `user-${Math.random().toString(36).substring(2, 9)}`

onMounted(async () => {
  try {
    // Generate a short ID for the new whiteboard
    const { nanoid } = await import('nanoid')
    const newId = nanoid(8)

    // Create the whiteboard via API
    const response = await $fetch<{ success: boolean; data: { id: string } }>(`/api/whiteboard`, {
      method: 'POST',
      body: {
        id: newId,
        name: 'New Whiteboard',
        project_id: null,
        created_by: createUserId,
      },
    })

    if (response?.success && response?.data?.id) {
      // Redirect to the newly created whiteboard
      await router.replace(`/whiteboard/${response.data.id}`)
    } else {
      // Fallback: redirect with the generated ID
      await router.replace(`/whiteboard/${newId}`)
    }
  } catch (error) {
    console.error('Failed to create whiteboard:', error)
    // Generate fallback ID and redirect
    const { nanoid } = await import('nanoid')
    const fallbackId = nanoid(8)
    await router.replace(`/whiteboard/${fallbackId}`)
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-100">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p class="text-neutral-600">Creating new whiteboard...</p>
    </div>
  </div>
</template>
