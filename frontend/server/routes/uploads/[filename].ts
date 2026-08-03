import fs from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')

export default defineEventHandler(async (event) => {
  const filename = event.context.params?.filename

  if (!filename) {
    throw createError({
      statusCode: 400,
      message: 'Filename required',
    })
  }

  const resolvedPath = path.resolve(UPLOAD_DIR, filename)

  // Prevent path traversal — verify the resolved path stays within UPLOAD_DIR
  if (!resolvedPath.startsWith(UPLOAD_DIR)) {
    throw createError({
      statusCode: 403,
      message: 'Forbidden',
    })
  }

  const filePath = resolvedPath

  try {
    // Check if file exists
    await fs.access(filePath)

    // Read file and return with proper content type
    const ext = filename.split('.').pop()?.toLowerCase()
    const contentTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
    }

    const contentType = contentTypes[ext || ''] || 'application/octet-stream'
    const fileBuffer = await fs.readFile(filePath)

    setHeader(event, 'content-type', contentType)
    return fileBuffer
  } catch {
    throw createError({
      statusCode: 404,
      message: 'File not found',
    })
  }
})
