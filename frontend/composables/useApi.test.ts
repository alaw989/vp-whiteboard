import { describe, expect, it, vi, beforeAll } from 'vitest'
import { useApi } from './useApi'

const mockApi = vi.fn()
const mockEnsureCsrf = vi.fn()

beforeAll(() => {
  vi.stubGlobal('useNuxtApp', () => ({
    $api: mockApi,
    $ensureCsrf: mockEnsureCsrf,
  }))
})

describe('useApi', () => {
  it('returns $api and $ensureCsrf', async () => {
    mockApi.mockResolvedValue({ data: 'ok' })
    mockEnsureCsrf.mockResolvedValue(undefined)

    const { $api, $ensureCsrf } = useApi()

    const result = await $api('/api/test', { method: 'POST' })
    expect(result).toEqual({ data: 'ok' })
    expect(mockApi).toHaveBeenCalledWith('/api/test', { method: 'POST' })

    await $ensureCsrf()
    expect(mockEnsureCsrf).toHaveBeenCalled()
  })
})
