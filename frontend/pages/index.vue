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
          <div class="flex items-center gap-3">
            <NuxtLink
              v-if="isAdmin"
              to="/approvals"
              class="btn-ghost text-sm"
              data-testid="nav-approvals"
            >
              <Icon name="mdi:account-check-outline" class="w-4 h-4" />
              Approvals
            </NuxtLink>
            <NuxtLink
              to="/whiteboard/new"
              class="btn-primary"
            >
              <Icon name="mdi:plus" class="w-5 h-5" />
              New Whiteboard
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

      <template v-else>
        <!-- Toolbar: search + sort + archived toggle -->
        <div class="flex flex-wrap items-center gap-3 mb-6">
          <div class="relative flex-1 min-w-[200px]">
            <Icon name="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              v-model="search"
              type="search"
              placeholder="Search whiteboards..."
              data-testid="board-search"
              class="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div class="flex items-center gap-2">
            <button
              v-for="opt in sortOptions"
              :key="opt.value"
              :data-testid="`sort-${opt.value}`"
              :class="[
                'px-3 py-2 text-sm rounded-lg border transition-colors',
                sort === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              ]"
              @click="setSort(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
          <button
            :data-testid="archivedToggleTestid"
            :class="[
              'flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors',
              showArchived
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            ]"
            @click="toggleArchived"
          >
            <Icon name="mdi:archive-outline" class="w-4 h-4" />
            {{ showArchived ? 'Active' : 'Archived' }}
          </button>
        </div>

        <!-- Empty State -->
        <div v-if="whiteboards.length === 0" class="text-center py-16">
          <div class="bg-white rounded-xl shadow-sm p-8 max-w-md mx-auto">
            <Icon name="mdi:clipboard-text-outline" class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 class="text-xl font-semibold text-gray-900 mb-2">{{ emptyTitle }}</h2>
            <p class="text-gray-600 mb-6">{{ emptyMessage }}</p>
            <NuxtLink v-if="!showArchived" to="/whiteboard/new" class="btn-primary">
              <Icon name="mdi:plus" class="w-5 h-5" />
              Create Whiteboard
            </NuxtLink>
          </div>
        </div>

        <!-- Whiteboard List -->
        <div v-else class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div
            v-for="whiteboard in whiteboards"
            :key="whiteboard.id"
            class="card card-hover-lift group relative"
          >
          <!-- Rename mode: show input outside the link -->
          <div v-if="renamingId === whiteboard.id" class="p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <input
                  ref="renameInput"
                  :value="renameValue"
                  class="text-lg font-semibold text-gray-900 bg-blue-50 border border-blue-300 rounded px-2 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  @input="renameValue = ($event.target as HTMLInputElement).value"
                  @keydown.enter="saveRename(whiteboard.id)"
                  @keydown.escape="cancelRename"
                  @blur="saveRename(whiteboard.id)"
                />
                <p class="text-sm text-gray-500 mt-1">
                  Created {{ formatDate(whiteboard.created_at) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-4 text-sm text-gray-500">
              <span class="flex items-center gap-1">
                <Icon name="mdi:update" class="w-4 h-4" />
                Updated {{ formatRelativeDate(whiteboard.updated_at) }}
              </span>
            </div>
          </div>

          <!-- Normal mode: clickable card -->
          <NuxtLink
            v-else
            :to="`/whiteboard/${whiteboard.id}`"
            class="block p-6"
          >
            <WhiteboardThumbnail
              :elements="whiteboard.canvas_state?.elements"
              :name="whiteboard.name"
              class="mb-4"
            />
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {{ whiteboard.name }}
                </h3>
                <p class="text-sm text-gray-500 mt-1">
                  Created {{ formatDate(whiteboard.created_at) }}
                </p>
              </div>
              <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Icon name="mdi:clipboard-text" class="w-5 h-5 text-blue-600" />
              </div>
            </div>

            <div class="flex items-center gap-4 text-sm text-gray-500">
              <span class="flex items-center gap-1">
                <Icon name="mdi:update" class="w-4 h-4" />
                Updated {{ formatRelativeDate(whiteboard.updated_at) }}
              </span>
            </div>
          </NuxtLink>

          <!-- Actions menu -->
          <div class="absolute top-3 right-3">
            <button
              class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
              @click.stop="toggleMenu(whiteboard.id)"
            >
              <Icon name="mdi:dots-vertical" class="w-5 h-5" />
            </button>
            <div
              v-if="menuOpenId === whiteboard.id"
              class="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 min-w-[140px]"
            >
              <button
                class="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                @click.stop="startRename(whiteboard)"
              >
                <Icon name="mdi:pencil" class="w-4 h-4" />
                Rename
              </button>
              <button
                v-if="showArchived"
                class="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                @click.stop="handleUnarchive(whiteboard)"
              >
                <Icon name="mdi:archive-arrow-down" class="w-4 h-4" />
                Unarchive
              </button>
              <button
                v-else
                class="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                @click.stop="handleArchive(whiteboard)"
              >
                <Icon name="mdi:archive-arrow-up" class="w-4 h-4" />
                Archive
              </button>
              <button
                class="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                @click.stop="confirmDelete(whiteboard)"
              >
                <Icon name="mdi:delete-outline" class="w-4 h-4" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
      </template>

      <!-- Delete Confirmation Modal -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="deleteTarget"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            @click.self="deleteTarget = null"
          >
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
              <div class="px-6 py-4 border-b border-neutral-200">
                <h2 class="text-lg font-semibold text-neutral-900">Delete Whiteboard</h2>
              </div>
              <div class="px-6 py-4">
                <p class="text-sm text-neutral-600">
                  Are you sure you want to delete <strong>{{ deleteTarget.name }}</strong>? This cannot be undone.
                </p>
              </div>
              <div class="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-end gap-3">
                <button class="btn-ghost" @click="deleteTarget = null">Cancel</button>
                <button
                  class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  :disabled="deleting"
                  @click="handleDelete(deleteTarget.id)"
                >
                  {{ deleting ? 'Deleting...' : 'Delete' }}
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { Whiteboard, ApiResponse } from '~/types'
import type { DashboardSort } from '~/utils/dashboard'
import { buildIndexQuery } from '~/utils/dashboard'
import { toastSuccess, toastError } from '~/composables/useToast'
import { useApprovals } from '~/composables/useApprovals'

const { $api } = useApi()
const { isAdmin, checkAdmin } = useApprovals()

// Fetch whiteboards
const whiteboards = ref<Whiteboard[]>([])
const pending = ref(true)
const error = ref<string | null>(null)

// Search + sort + archive visibility
const search = ref('')
const sort = ref<DashboardSort>('recent')
const showArchived = ref(false)
const sortOptions: { value: DashboardSort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'alpha', label: 'A–Z' },
]

let searchTimer: ReturnType<typeof setTimeout> | null = null

const archivedToggleTestid = computed(() => (showArchived.value ? 'archived-toggle-on' : 'archived-toggle-off'))

const emptyTitle = computed(() => (search.value.trim() ? 'No Matching Whiteboards' : 'No Whiteboards Yet'))

const emptyMessage = computed(() => {
  if (search.value.trim()) {
    return `No whiteboards match "${search.value.trim()}".`
  }
  if (showArchived.value) {
    return 'Nothing has been archived yet.'
  }
  return 'Create your first collaborative whiteboard to start collaborating with your team.'
})

async function refresh() {
  pending.value = true
  error.value = null
  try {
    const res = await $api<ApiResponse<Whiteboard[]>>(buildIndexQuery({
      search: search.value,
      sort: sort.value,
      includeArchived: showArchived.value,
    }))
    whiteboards.value = res.success ? (res.data || []) : []
  } catch (e) {
    // Auth errors are handled by the global middleware — don't flash an error
    if ((e as any)?.response?.status !== 401) {
      error.value = e instanceof Error ? e.message : 'Failed to load'
    }
  } finally {
    pending.value = false
  }
}

function setSort(value: DashboardSort) {
  sort.value = value
  refresh()
}

function toggleArchived() {
  showArchived.value = !showArchived.value
  refresh()
}

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(refresh, 250)
})

onMounted(() => {
  refresh()
  checkAdmin()
})

// Menu state
const menuOpenId = ref<string | null>(null)

// Rename state
const renamingId = ref<string | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)

// Delete state
const deleteTarget = ref<Whiteboard | null>(null)
const deleting = ref(false)

function toggleMenu(id: string) {
  menuOpenId.value = menuOpenId.value === id ? null : id
}

function startRename(whiteboard: Whiteboard) {
  menuOpenId.value = null
  renamingId.value = whiteboard.id
  renameValue.value = whiteboard.name
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

async function saveRename(id: string) {
  const name = renameValue.value.trim()
  if (!name || renamingId.value !== id) {
    cancelRename()
    return
  }

  const originalName = whiteboards.value.find(w => w.id === id)?.name
  if (name === originalName) {
    cancelRename()
    return
  }

  try {
    await $api(`/api/whiteboards/${id}`, {
      method: 'PATCH',
      body: { name },
    })
    toastSuccess('Whiteboard renamed')
    await refresh()
  } catch {
    toastError('Failed to rename whiteboard')
  }
  cancelRename()
}

function cancelRename() {
  renamingId.value = null
  renameValue.value = ''
}

function confirmDelete(whiteboard: Whiteboard) {
  menuOpenId.value = null
  deleteTarget.value = whiteboard
}

async function handleDelete(id: string) {
  deleting.value = true
  try {
    await $api(`/api/whiteboards/${id}`, { method: 'DELETE' })
    toastSuccess('Whiteboard deleted')
    deleteTarget.value = null
    await refresh()
  } catch {
    toastError('Failed to delete whiteboard')
  } finally {
    deleting.value = false
  }
}

async function handleArchive(whiteboard: Whiteboard) {
  menuOpenId.value = null
  try {
    await $api(`/api/whiteboards/${whiteboard.id}/archive`, { method: 'POST' })
    toastSuccess('Whiteboard archived')
    await refresh()
  } catch {
    toastError('Failed to archive whiteboard')
  }
}

async function handleUnarchive(whiteboard: Whiteboard) {
  menuOpenId.value = null
  try {
    await $api(`/api/whiteboards/${whiteboard.id}/unarchive`, { method: 'POST' })
    toastSuccess('Whiteboard restored')
    await refresh()
  } catch {
    toastError('Failed to restore whiteboard')
  }
}

// Close menu on outside click
onMounted(() => {
  document.addEventListener('click', () => {
    menuOpenId.value = null
  })
})

async function handleLogout() {
  await $api('/api/logout', { method: 'POST' })
  navigateTo('/login')
}

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
