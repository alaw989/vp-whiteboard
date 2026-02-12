import { createClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'
import fs from 'fs/promises'
import path from 'path'
import type { ApiResponse } from '~/types'

// Local storage fallback for development without Supabase
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR)
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
  }
}

export default defineEventHandler(async (event) => {
  try {
    const config = useRuntimeConfig()
    const supabaseUrl = config.supabaseUrl as string
    const supabaseKey = config.supabaseKey as string

    const useLocalStorage = !supabaseUrl || !supabaseKey

    // Parse form data
    const formData = await readFormData(event)
    const file = formData.get('file') as File
    const whiteboardId = formData.get('whiteboard_id') as string

    if (!file || !whiteboardId) {
      throw createError({
        statusCode: 400,
        message: 'File and whiteboard_id are required',
      })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      throw createError({
        statusCode: 400,
        message: 'Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.',
      })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      throw createError({
        statusCode: 400,
        message: 'File size exceeds 10MB limit.',
      })
    }

    // Convert File to Buffer/ArrayBuffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    let fileId: string
    let storagePath: string
    let publicUrl: string
    let fileRecord: any

    if (useLocalStorage) {
      // Local storage fallback
      await ensureUploadDir()

      fileId = nanoid()
      const fileExt = file.name.split('.').pop()
      const safeFileName = `${fileId}.${fileExt}`
      storagePath = path.join(UPLOAD_DIR, safeFileName)
      publicUrl = `/uploads/${safeFileName}`

      // Write file to disk
      await fs.writeFile(storagePath, buffer)

      // Create mock file record
      fileRecord = {
        id: fileId,
        whiteboard_id: whiteboardId,
        file_name: file.name,
        file_type: file.type,
        storage_path: publicUrl,
        file_size: file.size,
        created_at: new Date().toISOString(),
      }
    } else {
      // Supabase storage
      const supabase = createClient(supabaseUrl, supabaseKey)

      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${whiteboardId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('whiteboard-files')
        .upload(fileName, buffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        })

      if (uploadError) {
        throw createError({
          statusCode: 400,
          message: uploadError.message,
        })
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('whiteboard-files')
        .getPublicUrl(fileName)

      storagePath = fileName
      publicUrl = urlData.publicUrl

      // Save file metadata to database
      const { data: record, error: dbError } = await supabase
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

      if (dbError) {
        // Rollback storage upload
        await supabase.storage.from('whiteboard-files').remove([fileName])
        throw createError({
          statusCode: 400,
          message: dbError.message,
        })
      }

      fileId = record.id
      fileRecord = record
    }

    const response: ApiResponse<unknown> = {
      success: true,
      data: {
        fileId,
        fileName: file.name,
        storagePath,
        url: publicUrl,
        fileRecord,
      },
    }

    return response
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    const response: ApiResponse<unknown> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload file',
    }

    return response
  }
})
