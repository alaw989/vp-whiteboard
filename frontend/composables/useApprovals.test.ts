import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isAdminUser, pendingUsersFromResponse, useApprovals } from './useApprovals'

const mockApi = vi.fn()

beforeEach(() => {
  mockApi.mockReset()
  vi.stubGlobal('useNuxtApp', () => ({ $api: mockApi, $ensureCsrf: vi.fn() }))
})

const pendingUser = { id: 7, name: 'Ada Lovelace', email: 'ada@test.local', status: 'pending', created_at: '2026-08-01T00:00:00Z' }

describe('pendingUsersFromResponse — list normalization', () => {
  it('extracts the array from the { success, data } envelope', () => {
    expect(pendingUsersFromResponse({ success: true, data: [pendingUser] })).toEqual([pendingUser])
  })

  it('tolerates a bare array response', () => {
    expect(pendingUsersFromResponse([pendingUser])).toEqual([pendingUser])
  })

  it('returns an empty list for a missing or non-array payload', () => {
    expect(pendingUsersFromResponse(undefined)).toEqual([])
    expect(pendingUsersFromResponse(null)).toEqual([])
    expect(pendingUsersFromResponse({ success: true, data: null })).toEqual([])
    expect(pendingUsersFromResponse({ success: true, data: 'nope' })).toEqual([])
  })

  it('drops malformed entries instead of throwing', () => {
    expect(pendingUsersFromResponse({ success: true, data: [pendingUser, null, { name: 'no id' }, 'x', 42] }))
      .toEqual([pendingUser])
  })
})

describe('isAdminUser — admin detection', () => {
  it('true only for an explicit boolean true', () => {
    expect(isAdminUser({ is_admin: true })).toBe(true)
    expect(isAdminUser({ is_admin: false })).toBe(false)
    expect(isAdminUser({})).toBe(false)
    expect(isAdminUser(null)).toBe(false)
    expect(isAdminUser(undefined)).toBe(false)
    expect(isAdminUser({ is_admin: 'true' })).toBe(false)
  })
})

describe('useApprovals', () => {
  it('checkAdmin marks an admin user as admin', async () => {
    mockApi.mockResolvedValueOnce({ id: 1, email: 'owner@test.local', is_admin: true })

    const { isAdmin, adminChecked, checkAdmin } = useApprovals()
    const result = await checkAdmin()

    expect(mockApi).toHaveBeenCalledWith('/api/user')
    expect(result).toBe(true)
    expect(isAdmin.value).toBe(true)
    expect(adminChecked.value).toBe(true)
  })

  it('checkAdmin is false for a non-admin user and never throws', async () => {
    mockApi.mockResolvedValueOnce({ id: 2, email: 'u@test.local', is_admin: false })

    const { isAdmin, adminChecked, checkAdmin } = useApprovals()
    await checkAdmin()

    expect(isAdmin.value).toBe(false)
    expect(adminChecked.value).toBe(true)
  })

  it('checkAdmin is false when the /api/user fetch fails (defensive)', async () => {
    mockApi.mockRejectedValueOnce(new Error('401'))

    const { isAdmin, adminChecked, checkAdmin } = useApprovals()
    const result = await checkAdmin()

    expect(result).toBe(false)
    expect(isAdmin.value).toBe(false)
    expect(adminChecked.value).toBe(true)
  })

  it('load populates pending from the API envelope', async () => {
    mockApi.mockResolvedValueOnce({ success: true, data: [pendingUser] })

    const { pending, loading, error, load } = useApprovals()
    await load()

    expect(mockApi).toHaveBeenCalledWith('/api/approvals')
    expect(pending.value).toEqual([pendingUser])
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
  })

  it('load surfaces a readable error on failure', async () => {
    mockApi.mockRejectedValueOnce({ data: { message: 'Unauthorized' } })

    const { pending, error, load } = useApprovals()
    await load()

    expect(error.value).toBe('Unauthorized')
    expect(pending.value).toEqual([])
  })

  it('approve POSTs and removes the user from the list', async () => {
    mockApi.mockResolvedValueOnce({ success: true, data: [pendingUser] })
    mockApi.mockResolvedValueOnce({ success: true })

    const { pending, load, approve } = useApprovals()
    await load()
    await approve(7)

    expect(mockApi).toHaveBeenCalledWith('/api/approvals/7/approve', { method: 'POST' })
    expect(pending.value).toEqual([])
  })

  it('deny POSTs and removes the user from the list', async () => {
    mockApi.mockResolvedValueOnce({ success: true, data: [pendingUser] })
    mockApi.mockResolvedValueOnce({ success: true })

    const { pending, load, deny } = useApprovals()
    await load()
    await deny(7)

    expect(mockApi).toHaveBeenCalledWith('/api/approvals/7/deny', { method: 'POST' })
    expect(pending.value).toEqual([])
  })

  it('approve rethrows API failures so the caller can show feedback', async () => {
    mockApi.mockResolvedValueOnce({ success: true, data: [pendingUser] })
    mockApi.mockRejectedValueOnce({ data: { message: 'Unauthorized' } })

    const { pending, load, approve } = useApprovals()
    await load()
    await expect(approve(7)).rejects.toBeTruthy()
    expect(pending.value).toEqual([pendingUser])
  })
})
