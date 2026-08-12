<template>
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
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="$emit('close')"
      >
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-neutral-200">
            <h2 class="text-lg font-semibold text-neutral-900">Share Whiteboard</h2>
            <p class="text-sm text-neutral-500 mt-1">Create links for clients or engineers to collaborate in real-time</p>
          </div>

          <!-- Create Share Form -->
          <div class="px-6 py-4 border-b border-neutral-100">
            <div class="flex gap-2 mb-3">
              <input
                v-model="label"
                type="text"
                class="flex-1 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Label (e.g. ACME — Tower 2)"
              />
              <select
                v-model="role"
                class="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="edit">Can edit</option>
                <option value="view">View only</option>
              </select>
            </div>
            <div class="flex gap-2 mb-3">
              <select
                v-model="days"
                class="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option :value="null">Never expires</option>
                <option :value="7">7 days</option>
                <option :value="30">30 days</option>
                <option :value="90">90 days</option>
              </select>
              <button
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex-1 disabled:opacity-50"
                :disabled="creating"
                @click="createShare"
              >
                <div v-if="creating" class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mx-auto"></div>
                <span v-else>Create Link</span>
              </button>
            </div>
            <div v-if="createError" class="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{{ createError }}</div>
          </div>

          <!-- Share Links List -->
          <div class="px-6 py-4 max-h-64 overflow-y-auto">
            <p v-if="loading" class="text-sm text-neutral-500 text-center py-4">Loading...</p>
            <p v-else-if="!shares.length" class="text-sm text-neutral-500 text-center py-4">
              No share links yet. Create one above.
            </p>
            <div
              v-for="share in shares"
              :key="share.id"
              class="flex items-center gap-2 py-2 border-b border-neutral-100 last:border-0"
            >
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-neutral-900 truncate">
                  {{ share.label || (share.role === 'view' ? 'View-only link' : 'Edit link') }}
                  <span
                    v-if="share.id === justCreatedId"
                    class="ml-1 text-[10px] uppercase tracking-wide text-blue-600 bg-blue-50 rounded px-1 py-0.5 align-middle"
                  >New</span>
                </p>
                <p class="text-xs text-neutral-500">
                  {{ share.role === 'view' ? 'View only' : 'Can edit' }}
                  <span v-if="share.expires_at"> · expires {{ new Date(share.expires_at).toLocaleDateString() }}</span>
                  <span v-else> · no expiry</span>
                </p>
              </div>
              <button
                v-if="shareCopyUrl(share)"
                class="px-2 py-1 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
                title="Copy link"
                @click="copyShare(share)"
              >
                <Icon name="mdi:content-copy" class="w-4 h-4" />
              </button>
              <span
                v-else
                class="px-2 py-1 text-neutral-300 cursor-not-allowed"
                title="URL is only shown when this link is created"
              >
                <Icon name="mdi:content-copy" class="w-4 h-4" />
              </span>
              <button
                class="px-2 py-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                title="Revoke link"
                @click="revokeShare(share)"
              >
                <Icon name="mdi:link-off" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Info -->
          <div class="px-6 py-3 bg-neutral-50 border-t border-neutral-200">
            <p class="text-xs text-neutral-500">
              Clients don't need an account — they open the link and can collaborate in real-time.
              Revoking a link immediately blocks access.
            </p>
          </div>

          <!-- Actions -->
          <div class="px-6 py-4 bg-neutral-50 flex justify-end">
            <button
              class="px-4 py-2 bg-neutral-200 text-neutral-700 hover:bg-neutral-300 rounded-lg transition-colors"
              @click="$emit('close')"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { toastSuccess, toastError } from '~/composables/useToast'
import { shareCopyUrl } from '~/composables/useShareLink'
import { friendlyApiErrorMessage } from '~/utils/apiError'

const props = defineProps<{
  show: boolean
  whiteboardId: string
}>()

const emit = defineEmits<{
  close: []
}>()

const { $api } = useApi()
const config = useRuntimeConfig()
const baseUrl = (config.public.siteUrl as string) || ''

const label = ref('')
const role = ref<'edit' | 'view'>('edit')
const days = ref<number | null>(null)
const shares = ref<any[]>([])
const loading = ref(false)
const creating = ref(false)
const createError = ref('')
// The link created in this session — the only one whose raw URL is known.
const justCreatedId = ref<string | null>(null)

interface ShareLink {
  id: string
  url?: string
  label?: string
  role: string
  expires_at?: string
}

watch(() => props.show, (isOpen) => {
  if (isOpen) {
    loadShares()
  }
})

async function loadShares() {
  loading.value = true
  try {
    const res = await $api<{ success: boolean; data: any[] }>(`/api/whiteboards/${props.whiteboardId}/shares`)
    if (res.success) shares.value = res.data
  } catch {
    shares.value = []
  } finally {
    loading.value = false
  }
}

async function createShare() {
  creating.value = true
  createError.value = ''
  try {
    const res = await $api<{ success: boolean; data: ShareLink }>(`/api/whiteboards/${props.whiteboardId}/shares`, {
      method: 'POST',
      body: {
        role: role.value,
        label: label.value || null,
        days: days.value,
      },
    })
    if (res.success && res.data) {
      shares.value.unshift(res.data)
      justCreatedId.value = res.data.id
      label.value = ''
      toastSuccess('Share link created')
    }
  } catch (e: any) {
    createError.value = friendlyApiErrorMessage(e, 'Failed to create link')
  } finally {
    creating.value = false
  }
}

async function copyShare(share: any) {
  const url = shareCopyUrl(share)
  if (!url) {
    toastError("This link's URL is only available when it is created")
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    toastSuccess('Link copied to clipboard')
  } catch {
    toastSuccess(url)
  }
}

async function revokeShare(share: any) {
  try {
    await $api(`/api/whiteboards/${props.whiteboardId}/shares/${share.id}`, { method: 'DELETE' })
    shares.value = shares.value.filter(s => s.id !== share.id)
    toastSuccess('Link revoked')
  } catch {
    toastSuccess('Failed to revoke link')
  }
}
</script>
