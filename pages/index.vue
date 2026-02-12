<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="container mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">VP Associates</h1>
            <p class="text-sm text-gray-500">Collaborative Whiteboard</p>
          </div>
          <NuxtLink
            to="/whiteboard/new"
            class="btn-primary"
          >
            <Icon name="mdi:plus" class="w-5 h-5" />
            New Whiteboard
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <!-- Loading State -->
      <div v-if="pending" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-12">
        <Icon name="mdi:alert-circle" class="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 mb-2">Failed to Load Whiteboards</h2>
        <p class="text-gray-600 mb-4">{{ error }}</p>
        <button @click="() => refresh()" class="btn-primary">
          Try Again
        </button>
      </div>

      <!-- Empty State -->
      <div v-else-if="whiteboards.length === 0" class="text-center py-16">
        <div class="bg-white rounded-xl shadow-sm p-8 max-w-md mx-auto">
          <Icon name="mdi:clipboard-text-outline" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-gray-900 mb-2">No Whiteboards Yet</h2>
          <p class="text-gray-600 mb-6">
            Create your first collaborative whiteboard to start collaborating with your team.
          </p>
          <NuxtLink to="/whiteboard/new" class="btn-primary">
            <Icon name="mdi:plus" class="w-5 h-5" />
            Create Whiteboard
          </NuxtLink>
        </div>
      </div>

      <!-- Whiteboard List -->
      <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <NuxtLink
          v-for="whiteboard in whiteboards"
          :key="whiteboard.id"
          :to="`/whiteboard/${whiteboard.id}`"
          class="card hover:shadow-md transition-shadow group"
        >
          <div class="p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {{ whiteboard.name }}
                </h3>
                <p class="text-sm text-gray-500 mt-1">
                  Created {{ formatDate(whiteboard.created_at) }}
                </p>
              </div>
              <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Icon name="mdi:clipboard-text" class="w-5 h-5 text-blue-600" />
              </div>
            </div>

            <div class="flex items-center gap-4 text-sm text-gray-500">
              <span class="flex items-center gap-1">
                <Icon name="mdi:update" class="w-4 h-4" />
                Updated {{ formatRelativeDate(whiteboard.updated_at) }}
              </span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { Whiteboard, ApiResponse } from '~/types'

// Fetch whiteboards
const { data, pending, error, refresh } = await useFetch<ApiResponse<Whiteboard[]>>('/api/whiteboard')

const whiteboards = computed(() => data.value?.success ? (data.value.data || []) : [])

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateString)
}

// SEO
useHead({
  title: 'Collaborative Whiteboards - VP Associates',
  meta: [
    { name: 'description', content: 'Real-time collaborative whiteboards for structural engineering projects' },
  ],
})
</script>
