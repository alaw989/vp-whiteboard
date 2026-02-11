import { ref, readonly } from 'vue'
import type { Stage } from 'konva/lib/Stage'
import type { ExportFormat, ExportOptions, ExportState } from '~/types'

export function useExport() {
  const isExporting = ref(false)
  const progress = ref(0)
  const error = ref<string | null>(null)

  // Generate ISO timestamp for filename
  function getTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  }

  // Generate filename from document name or default
  function generateFilename(baseName: string, format: ExportFormat): string {
    const sanitized = baseName.replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const timestamp = getTimestamp()
    const ext = format === 'pdf' ? 'pdf' : 'png'
    return `${sanitized}-${timestamp}.${ext}`
  }

  // Trigger browser download
  function triggerDownload(dataUrl: string, filename: string): void {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  }

  // Export canvas as PNG
  async function exportAsPNG(
    stage: Stage | null,
    options: Partial<ExportOptions> = {}
  ): Promise<void> {
    if (!stage) {
      error.value = 'Canvas not available'
      return
    }

    try {
      isExporting.value = true
      progress.value = 0
      error.value = null

      // Allow UI update
      await new Promise(resolve => setTimeout(resolve, 50))

      // Export at 1x pixel ratio per locked decision (screen quality)
      const dataUrl = stage.toDataURL({
        pixelRatio: options.pixelRatio ?? 1,
        x: 0,
        y: 0,
        width: stage.width(),
        height: stage.height(),
      })

      progress.value = 100

      const filename = options.filename ?? generateFilename('whiteboard', 'png')
      triggerDownload(dataUrl, filename)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Export failed'
    } finally {
      isExporting.value = false
    }
  }

  return {
    isExporting: readonly(isExporting),
    progress: readonly(progress),
    error: readonly(error),
    exportAsPNG,
  }
}
