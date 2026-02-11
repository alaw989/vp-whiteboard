import * as pdfjsLib from 'pdfjs-dist'

export default defineNuxtPlugin(() => {
  // Only run on client side
  if (import.meta.client) {
    // Configure worker using Vite-compatible URL resolution
    // This ensures version matching between main library and worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  }
})
