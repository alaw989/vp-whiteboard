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
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
    <div class="text-center animate-fade-in">
      <div class="relative w-16 h-16 mx-auto mb-6">
        <!-- Outer ring -->
        <div class="absolute inset-0 rounded-full border-4 border-blue-200"></div>
        <!-- Spinning arc -->
        <div class="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin"></div>
        <!-- Center dot -->
        <div class="absolute inset-0 flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div>
        </div>
      </div>
      <h1 class="text-xl font-semibold text-neutral-900 mb-2">Creating New Whiteboard</h1>
      <p class="text-neutral-600">Setting up your collaborative workspace...</p>
    </div>
  </div>
</template>
