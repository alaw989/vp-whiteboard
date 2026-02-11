<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="container mx-auto px-4 py-4">
        <div class="flex items-center gap-4">
          <NuxtLink to="/" class="text-gray-600 hover:text-gray-900">
            <Icon name="mdi:arrow-left" class="w-6 h-6" />
          </NuxtLink>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">Create Whiteboard</h1>
            <p class="text-sm text-gray-500">Start a new collaborative session</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <div class="max-w-xl mx-auto">
        <div class="card">
          <form @submit.prevent="createWhiteboard" class="p-6 space-y-6">
            <!-- Name -->
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
                Whiteboard Name
              </label>
              <input
                id="name"
                v-model="formData.name"
                type="text"
                class="input"
                placeholder="e.g., Project X Structural Review"
                required
                autofocus
              />
            </div>

            <!-- Project ID (Optional) -->
            <div>
              <label for="project" class="block text-sm font-medium text-gray-700 mb-2">
                Associated Project (Optional)
              </label>
              <input
                id="project"
                v-model="formData.project_id"
                type="text"
                class="input"
                placeholder="Project ID or reference"
              />
              <p class="text-xs text-gray-500 mt-1">
                Link this whiteboard to a specific project for organization
              </p>
            </div>

            <!-- User Info -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="userName" class="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <input
                  id="userName"
                  v-model="formData.user_name"
                  type="text"
                  class="input"
                  placeholder="Your name"
                  required
                />
              </div>
            </div>

            <!-- Error -->
            <div v-if="error" class="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <Icon name="mdi:alert-circle" class="w-4 h-4 flex-shrink-0" />
              {{ error }}
            </div>

            <!-- Actions -->
            <div class="flex gap-3">
              <NuxtLink
                to="/"
                class="btn-secondary flex-1 justify-center"
              >
                Cancel
              </NuxtLink>
              <button
                type="submit"
                :disabled="creating || !formData.name || !formData.user_name"
                class="btn-primary flex-1 justify-center"
                :class="{ 'opacity-50 cursor-not-allowed': creating || !formData.name || !formData.user_name }"
              >
                <Icon
                  v-if="creating"
                  name="mdi:loading"
                  class="w-5 h-5 animate-spin"
                />
                <Icon v-else name="mdi:plus" class="w-5 h-5" />
                {{ creating ? 'Creating...' : 'Create Whiteboard' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Quick Start Templates -->
        <div class="mt-8">
          <h3 class="text-lg font-semibold text-gray-900 mb-4">Quick Start Templates</h3>
          <div class="grid grid-cols-2 gap-4">
            <button
              @click="useTemplate('blank')"
              class="card p-4 text-left hover:shadow-md transition-all group"
            >
              <div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                <Icon name="mdi:file-outline" class="w-6 h-6 text-gray-600 group-hover:text-blue-600" />
              </div>
              <h4 class="font-medium text-gray-900">Blank Canvas</h4>
              <p class="text-sm text-gray-500">Start with an empty canvas</p>
            </button>

            <button
              @click="useTemplate('structural')"
              class="card p-4 text-left hover:shadow-md transition-all group"
            >
              <div class="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                <Icon name="mdi:domain" class="w-6 h-6 text-gray-600 group-hover:text-blue-600" />
              </div>
              <h4 class="font-medium text-gray-900">Structural Review</h4>
              <p class="text-sm text-gray-500">Pre-configured for structural drawings</p>
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { Whiteboard } from '~/types'

const router = useRouter()

const formData = ref({
  name: '',
  project_id: '',
  user_name: '',
})

const creating = ref(false)
const error = ref('')

// Generate user ID
const userId = ref(`user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`)

async function createWhiteboard() {
  error.value = ''

  if (!formData.value.name || !formData.value.user_name) {
    error.value = 'Please fill in all required fields'
    return
  }

  creating.value = true

  try {
    const response = await $fetch<ApiResponse<Whiteboard>>('/api/whiteboard', {
      method: 'POST',
      body: {
        name: formData.value.name,
        project_id: formData.value.project_id || undefined,
        created_by: userId.value,
      },
    })

    if (response.success && response.data) {
      // Store user info in session storage
      sessionStorage.setItem('whiteboard-user', JSON.stringify({
        id: userId.value,
        name: formData.value.user_name,
      }))

      // Navigate to whiteboard
      await router.push(`/whiteboard/${response.data.id}`)
    } else {
      error.value = response.error || 'Failed to create whiteboard'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'An unexpected error occurred'
  } finally {
    creating.value = false
  }
}

function useTemplate(template: string) {
  switch (template) {
    case 'blank':
      formData.value.name = 'Untitled Whiteboard'
      break
    case 'structural':
      formData.value.name = 'Structural Review - ' + new Date().toLocaleDateString()
      break
  }
}

// Restore user info from session
onMounted(() => {
  const savedUser = sessionStorage.getItem('whiteboard-user')
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser)
      formData.value.user_name = user.name || ''
      userId.value = user.id || userId.value
    } catch {
      // Ignore parse errors
    }
  }
})
</script>
