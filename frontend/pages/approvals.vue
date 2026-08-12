<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Header -->
    <header class="bg-white shadow-sm">
      <div class="container mx-auto px-4 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900">VP Associates</h1>
            <p class="text-sm text-gray-500">Pending Registrations</p>
          </div>
          <div class="flex items-center gap-3">
            <NuxtLink to="/" class="btn-ghost text-sm">
              <Icon name="mdi:arrow-left" class="w-4 h-4" />
              Whiteboards
            </NuxtLink>
            <button @click="handleLogout" class="btn-ghost text-sm">
              <Icon name="mdi:logout" class="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="container mx-auto px-4 py-8">
      <!-- Admin check in flight -->
      <div v-if="!adminChecked" class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>

      <!-- Non-admin: show a forbidden state without calling the approvals API -->
      <div v-else-if="!isAdmin" class="text-center py-16">
        <div class="bg-white rounded-xl shadow-sm p-8 max-w-md mx-auto">
          <Icon name="mdi:shield-lock-outline" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 class="text-xl font-semibold text-gray-900 mb-2">Admins Only</h2>
          <p class="text-gray-600 mb-6">
            You don't have permission to view pending registrations.
          </p>
          <NuxtLink to="/" class="btn-primary">
            <Icon name="mdi:arrow-left" class="w-4 h-4" />
            Back to Whiteboards
          </NuxtLink>
        </div>
      </div>

      <!-- Admin view -->
      <div v-else>
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-gray-900">Approvals</h2>
          <button class="btn-ghost text-sm" :disabled="loading" @click="load">
            <Icon name="mdi:refresh" class="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div v-if="error" class="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 mb-6">
          {{ error }}
        </div>

        <!-- Empty state -->
        <div v-if="!loading && pending.length === 0" class="text-center py-16">
          <div class="bg-white rounded-xl shadow-sm p-8 max-w-md mx-auto">
            <Icon name="mdi:check-circle-outline" class="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 class="text-xl font-semibold text-gray-900 mb-2">All Caught Up</h2>
            <p class="text-gray-600">No pending registration requests.</p>
          </div>
        </div>

        <!-- Pending list -->
        <div v-else class="space-y-4">
          <div
            v-for="user in pending"
            :key="user.id"
            class="card card-hover-lift p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900">{{ user.name }}</h3>
              <p class="text-sm text-gray-500">{{ user.email }}</p>
              <p class="text-sm text-gray-400 mt-1">
                Requested {{ formatDate(user.created_at) }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <button
                class="btn-primary"
                :disabled="busyId === user.id"
                @click="handleApprove(user)"
              >
                <Icon name="mdi:check" class="w-4 h-4" />
                Approve
              </button>
              <button
                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-1"
                :disabled="busyId === user.id"
                @click="handleDeny(user)"
              >
                <Icon name="mdi:close" class="w-4 h-4" />
                Deny
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { toastError, toastSuccess } from '~/composables/useToast'
import { useApprovals } from '~/composables/useApprovals'
import { friendlyApiErrorMessage } from '~/utils/apiError'
import type { PendingUser } from '~/composables/useApprovals'

const { $api } = useApi()
const { pending, loading, error, isAdmin, adminChecked, checkAdmin, load, approve, deny } = useApprovals()

const busyId = ref<number | null>(null)

onMounted(async () => {
  await checkAdmin()
  if (isAdmin.value) {
    await load()
  }
})

async function handleApprove(user: PendingUser) {
  busyId.value = user.id
  try {
    await approve(user.id)
    toastSuccess(`${user.name} approved`)
  } catch (e: any) {
    toastError(friendlyApiErrorMessage(e, `Failed to approve ${user.name}`))
  } finally {
    busyId.value = null
  }
}

async function handleDeny(user: PendingUser) {
  busyId.value = user.id
  try {
    await deny(user.id)
    toastSuccess(`${user.name} denied`)
  } catch (e: any) {
    toastError(friendlyApiErrorMessage(e, `Failed to deny ${user.name}`))
  } finally {
    busyId.value = null
  }
}

async function handleLogout() {
  await $api('/api/logout', { method: 'POST' })
  navigateTo('/login')
}

function formatDate(dateString?: string): string {
  if (!dateString) return 'recently'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return 'recently'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

useHead({ title: 'Approvals - VP Associates' })
</script>
