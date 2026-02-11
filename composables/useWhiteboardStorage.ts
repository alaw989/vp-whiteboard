import { createClient } from '@supabase/supabase-js'
import type { Whiteboard, WhiteboardFile, ApiResponse, UploadResult } from '~/types'

export function useWhiteboardStorage() {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseKey = config.public.supabaseKey as string

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Whiteboard CRUD operations
  async function createWhiteboard(data: {
    name: string
    project_id?: string
    created_by: string
  }): Promise<ApiResponse<Whiteboard>> {
    try {
      const { data: whiteboard, error } = await supabase
        .from('whiteboards')
        .insert({
          name: data.name,
          project_id: data.project_id,
          created_by: data.created_by,
          canvas_state: { version: 1, elements: [] },
        })
        .select()
        .single()

      if (error) throw error

      return { success: true, data: whiteboard }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create whiteboard',
      }
    }
  }

  async function getWhiteboard(id: string): Promise<ApiResponse<Whiteboard>> {
    try {
      const { data: whiteboard, error } = await supabase
        .from('whiteboards')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      return { success: true, data: whiteboard }
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
      let query = supabase
        .from('whiteboards')
        .select('*')
        .order('updated_at', { ascending: false })

      if (filters?.project_id) {
        query = query.eq('project_id', filters.project_id)
      }
      if (filters?.created_by) {
        query = query.eq('created_by', filters.created_by)
      }
      if (filters?.limit) {
        query = query.limit(filters.limit)
      }

      const { data: whiteboards, error } = await query

      if (error) throw error

      return { success: true, data: whiteboards || [] }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list whiteboards',
      }
    }
  }

  async function updateWhiteboard(
    id: string,
    updates: Partial<Pick<Whiteboard, 'name' | 'canvas_state'>>
  ): Promise<ApiResponse<Whiteboard>> {
    try {
      const { data: whiteboard, error } = await supabase
        .from('whiteboards')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { success: true, data: whiteboard }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update whiteboard',
      }
    }
  }

  async function deleteWhiteboard(id: string): Promise<ApiResponse<void>> {
    try {
      const { error } = await supabase
        .from('whiteboards')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete whiteboard',
      }
    }
  }

  // File operations
  async function uploadFile(
    whiteboardId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<UploadResult>> {
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${whiteboardId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('whiteboard-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('whiteboard-files')
        .getPublicUrl(fileName)

      // Save file metadata to database
      const { data: fileRecord, error: dbError } = await supabase
        .from('whiteboard_files')
        .insert({
          whiteboard_id: whiteboardId,
          file_name: file.name,
          file_type: file.type,
          storage_path: fileName,
          file_size: file.size,
        })
        .select()
        .single()

      if (dbError) throw dbError

      return {
        success: true,
        data: {
          fileId: fileRecord.id,
          fileName: file.name,
          storagePath: fileName,
          url: urlData.publicUrl,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload file',
      }
    }
  }

  async function getWhiteboardFiles(whiteboardId: string): Promise<ApiResponse<WhiteboardFile[]>> {
    try {
      const { data: files, error } = await supabase
        .from('whiteboard_files')
        .select('*')
        .eq('whiteboard_id', whiteboardId)
        .order('created_at', { ascending: true })

      if (error) throw error

      return { success: true, data: files || [] }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch files',
      }
    }
  }

  async function deleteFile(fileId: string): Promise<ApiResponse<void>> {
    try {
      // Get file info first
      const { data: file } = await supabase
        .from('whiteboard_files')
        .select('storage_path')
        .eq('id', fileId)
        .single()

      if (file?.storage_path) {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('whiteboard-files')
          .remove([file.storage_path])

        if (storageError) throw storageError
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('whiteboard_files')
        .delete()
        .eq('id', fileId)

      if (dbError) throw dbError

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete file',
      }
    }
  }

  return {
    // Whiteboard operations
    createWhiteboard,
    getWhiteboard,
    listWhiteboards,
    updateWhiteboard,
    deleteWhiteboard,

    // File operations
    uploadFile,
    getWhiteboardFiles,
    deleteFile,

    // Raw client for advanced usage
    supabase,
  }
}
