import type { UploadResult } from '~/types'

// Validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export interface FileValidationError {
  valid: boolean
  error?: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void
  signal?: AbortSignal
}

/**
 * Validate file before upload
 */
export function validateFile(file: File): FileValidationError {
  if (!ALLOWED_TYPES.includes(file.type as any)) {
    return {
      valid: false,
      error: `Invalid file type. Please upload ${ALLOWED_TYPES.map(t => t.split('/')[1]).join(', ')}.`,
    }
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds 10MB limit. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`,
    }
  }

  return { valid: true }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Get icon name for file type
 */
export function getFileIcon(type: string): string {
  const icons: Record<string, string> = {
    'image/jpeg': 'mdi:image',
    'image/png': 'mdi:image',
    'image/webp': 'mdi:image',
    'application/pdf': 'mdi:file-pdf-box',
  }
  return icons[type] || 'mdi:file'
}

export function useFileUpload() {
  const { $api, $ensureCsrf: ensureCsrf } = useNuxtApp()

  /**
   * Upload a file with progress tracking
   */
  async function uploadFile(
    whiteboardId: string,
    file: File,
    options: UploadOptions = {}
  ): Promise<{ success: boolean; data?: UploadResult; error?: string }> {
    const validation = validateFile(file)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    try {
      await ensureCsrf()

      const formData = new FormData()
      formData.append('file', file)
      formData.append('whiteboard_id', whiteboardId)

      const config = useRuntimeConfig()
      const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'

      // Use raw $fetch for upload progress support (Nitro types don't include onUploadProgress)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetchOpts: any = {
        method: 'POST',
        body: formData,
        credentials: 'include',
        onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          if (options.onProgress && progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            options.onProgress({
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percent,
            })
          }
        },
        signal: options.signal,
      }

      const response = await $fetch<{ success: boolean; data?: UploadResult; error?: string }>(
        `${laravelUrl}/api/files`,
        fetchOpts
      )

      if (response.success && response.data) {
        return { success: true, data: response.data }
      }

      return { success: false, error: response.error || 'Upload failed' }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      return { success: false, error: errorMsg }
    }
  }

  /**
   * Upload multiple files (sequential)
   */
  async function uploadFiles(
    whiteboardId: string,
    files: File[],
    options: UploadOptions = {}
  ): Promise<{ success: boolean; results: UploadResult[]; errors: string[] }> {
    const results: UploadResult[] = []
    const errors: string[] = []

    for (const file of files) {
      const result = await uploadFile(whiteboardId, file, options)
      if (result.success && result.data) {
        results.push(result.data)
      } else {
        errors.push(`${file.name}: ${result.error}`)
      }
    }

    return { success: errors.length === 0, results, errors }
  }

  return {
    uploadFile,
    uploadFiles,
    validateFile,
    formatFileSize,
    getFileIcon,
    MAX_FILE_SIZE,
    ALLOWED_TYPES,
  }
}
