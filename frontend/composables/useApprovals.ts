import { ref } from 'vue'
import { useApi } from './useApi'

export interface PendingUser {
  id: number
  name: string
  email: string
  status?: string
  is_admin?: boolean
  created_at?: string
}

/**
 * Extract the pending-user list from a `GET /api/approvals` response. The API
 * wraps the array in `{ success: true, data: [...] }`; tolerate a bare array
 * and drop malformed entries rather than crashing the page on a shape change.
 */
export function pendingUsersFromResponse(response: unknown): PendingUser[] {
  const data = (response as { data?: unknown } | null)?.data ?? response
  if (!Array.isArray(data)) return []
  return data.filter((u): u is PendingUser =>
    !!u && typeof u === 'object' && typeof (u as { id?: unknown }).id === 'number')
}

/**
 * True when the (serialized) `/api/user` payload belongs to an admin. The
 * backend exposes `is_admin` as a boolean; anything else (including an absent
 * field, e.g. legacy accounts) must NOT be treated as admin.
 */
export function isAdminUser(user: unknown): boolean {
  return (user as { is_admin?: boolean } | null)?.is_admin === true
}

export function useApprovals() {
  const { $api } = useApi()

  const pending = ref<PendingUser[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const isAdmin = ref(false)
  const adminChecked = ref(false)

  /**
   * Resolve whether the signed-in user is an admin via `/api/user`. The API
   * itself already 403s non-admins; this is the UX guard so the page can show a
   * "forbidden" state without ever hitting `/api/approvals`.
   */
  async function checkAdmin(): Promise<boolean> {
    try {
      const user = await $api<unknown>('/api/user')
      isAdmin.value = isAdminUser(user)
    } catch {
      isAdmin.value = false
    } finally {
      adminChecked.value = true
    }
    return isAdmin.value
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await $api<unknown>('/api/approvals')
      pending.value = pendingUsersFromResponse(res)
    } catch (e) {
      const err = e as { data?: { message?: string }; message?: string }
      error.value = err?.data?.message || err?.message || 'Failed to load pending registrations'
    } finally {
      loading.value = false
    }
  }

  async function approve(id: number) {
    await $api(`/api/approvals/${id}/approve`, { method: 'POST' })
    pending.value = pending.value.filter(u => u.id !== id)
  }

  async function deny(id: number) {
    await $api(`/api/approvals/${id}/deny`, { method: 'POST' })
    pending.value = pending.value.filter(u => u.id !== id)
  }

  return { pending, loading, error, isAdmin, adminChecked, checkAdmin, load, approve, deny }
}
