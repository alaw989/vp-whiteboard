import type { Whiteboard, WhiteboardFile, ApiResponse, UploadResult } from '~/types'

export function useWhiteboardStorage() {
  const { $api } = useNuxtApp()

  async function createWhiteboard(data: {
    name: string
    project_id?: string
    created_by: string
  }): Promise<ApiResponse<Whiteboard>> {
    try {
      const response = await $api<ApiResponse<Whiteboard>>('/api/whiteboards', {
        method: 'POST',
        body: data,
      })
      return response
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create whiteboard',
      }
    }
  }

  async function getWhiteboard(id: string): Promise<ApiResponse<Whiteboard>> {
    try {
      const response = await $api<ApiResponse<Whiteboard>>(`/api/whiteboards/${id}`)
      return response
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch whiteboard',
      }
    }
  }

  async function listWhiteboards(filters?: {
    project_id?: string
    created_by?: string
    limit?: number
  }): Promise<ApiResponse<Whiteboard[]>> {
    try {
      const params: Record<string, string> = {}
      if (filters?.project_id) params.project_id = filters.project_id
      if (filters?.created_by) params.created_by = filters.created_by
      if (filters?.limit) params.limit = String(filters.limit)

      const response = await $api<ApiResponse<Whiteboard[]>>('/api/whiteboards', { query: params })
      return response
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list whiteboards',
      }
    }
  }

  async function updateWhiteboard(
    id: string,
    updates: Partial<Whiteboard>,
  ): Promise<ApiResponse<Whiteboard>> {
    try {
      const response = await $api<ApiResponse<Whiteboard>>(`/api/whiteboards/${id}`, {
        method: 'PATCH',
        body: updates,
      })
      return response
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update whiteboard',
      }
    }
  }

  async function deleteWhiteboard(id: string): Promise<ApiResponse<void>> {
    try {
      await $api<ApiResponse<void>>(`/api/whiteboards/${id}`, { method: 'DELETE' })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete whiteboard',
      }
    }
  }

  async function getWhiteboardFiles(whiteboardId: string): Promise<ApiResponse<WhiteboardFile[]>> {
    try {
      const response = await $api<ApiResponse<WhiteboardFile[]>>('/api/files', {
        query: { whiteboard_id: whiteboardId },
      })
      return response
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch files',
      }
    }
  }

  async function deleteFile(fileId: string): Promise<ApiResponse<void>> {
    try {
      await $api<ApiResponse<void>>(`/api/files/${fileId}`, { method: 'DELETE' })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file',
      }
    }
  }

  return {
    createWhiteboard,
    getWhiteboard,
    listWhiteboards,
    updateWhiteboard,
    deleteWhiteboard,
    getWhiteboardFiles,
    deleteFile,
  }
}
