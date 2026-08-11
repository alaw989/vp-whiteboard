import { describe, expect, it } from 'vitest'
import { validateFile, formatFileSize, getFileIcon } from './useFileUpload'

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024

describe('validateFile', () => {
  function makeFile(type: string, size = 1024): File {
    return new File([new Uint8Array(size)], `file.${type.split('/')[1]}`, { type })
  }

  it('accepts allowed types under the size limit', () => {
    for (const type of ALLOWED) {
      expect(validateFile(makeFile(type)).valid).toBe(true)
    }
  })

  it('rejects disallowed types with a type error listing allowed extensions', () => {
    const result = validateFile(makeFile('text/html'))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file type')
    expect(result.error).toContain('pdf')
    expect(result.error).toContain('jpeg')
    expect(result.error).toContain('png')
    expect(result.error).toContain('webp')
  })

  it('rejects empty mime types', () => {
    const result = validateFile(makeFile(''))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid file type')
  })

  it('rejects files over the 10MB limit with a size error', () => {
    const result = validateFile(makeFile('image/png', MAX_SIZE + 1))
    expect(result.valid).toBe(false)
    expect(result.error).toContain('10MB limit')
    expect(result.error).toMatch(/10\.0MB/)
  })

  it('accepts a file exactly at the size limit', () => {
    expect(validateFile(makeFile('application/pdf', MAX_SIZE)).valid).toBe(true)
  })
})

describe('formatFileSize', () => {
  it('formats bytes under 1KB as B', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
  })

  it('formats kilobytes with one decimal', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
  })

  it('formats megabytes with one decimal', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(Math.round(2.5 * 1024 * 1024))).toBe('2.5 MB')
  })
})

describe('getFileIcon', () => {
  it('maps image types to the image icon', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(getFileIcon(type)).toBe('mdi:image')
    }
  })

  it('maps pdf to the pdf icon', () => {
    expect(getFileIcon('application/pdf')).toBe('mdi:file-pdf-box')
  })

  it('falls back to a generic file icon for unknown types', () => {
    expect(getFileIcon('text/plain')).toBe('mdi:file')
    expect(getFileIcon('')).toBe('mdi:file')
  })
})
