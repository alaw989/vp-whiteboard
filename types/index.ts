// Whiteboard Types
export interface Whiteboard {
  id: string
  project_id?: string
  name: string
  created_by: string
  created_at: string
  updated_at: string
  canvas_state?: CanvasState
}

// Session Types
export interface Session {
  id: string
  short_id: string
  name: string
  created_at: string
  updated_at: string
  expires_at: string
  canvas_state?: CanvasState
}

export interface WhiteboardFile {
  id: string
  whiteboard_id: string
  file_name: string
  file_type: string
  storage_path: string
  file_size: number
  metadata?: FileMetadata
  created_at: string
}

export interface FileMetadata {
  width?: number
  height?: number
  pageCount?: number
  layer?: number
  position?: { x: number; y: number }
  scale?: number
}

export interface CanvasState {
  version: number
  elements: CanvasElement[]
  viewport?: ViewportState
}

export interface CanvasElement {
  id: string
  type: 'stroke' | 'line' | 'rectangle' | 'circle' | 'image' | 'text'
  userId: string
  userName: string
  timestamp: number
  data: StrokeElement | LineElement | RectangleElement | CircleElement | ImageElement | TextElement
}

export interface StrokeElement {
  points: [number, number, number][] // [x, y, pressure]
  color: string
  size: number
  tool: 'pen' | 'highlighter'
  smooth: boolean
}

export interface LineElement {
  start: [number, number]
  end: [number, number]
  color: string
  size: number
}

export interface RectangleElement {
  x: number
  y: number
  width: number
  height: number
  stroke: string
  strokeWidth: number
  fill?: string
}

export interface CircleElement {
  cx: number
  cy: number
  radius: number
  stroke: string
  strokeWidth: number
  fill?: string
}

export interface ImageElement {
  src: string
  x: number
  y: number
  width: number
  height: number
  fileId?: string
  // Document layer support
  isDocument?: boolean
  layer?: number  // Layer index for z-ordering
  documentType?: 'pdf' | 'image'
  pageNumber?: number  // For PDFs
}

export interface TextElement {
  text: string
  x: number
  y: number
  fontSize: number
  color: string
  fontFamily: string
}

export interface ViewportState {
  x: number
  y: number
  zoom: number
}

// Drawing Tool Types
export type DrawingTool = 'select' | 'pan' | 'pen' | 'highlighter' | 'line' | 'rectangle' | 'circle' | 'text' | 'eraser'

export interface ToolSettings {
  tool: DrawingTool
  color: string
  size: number
  opacity: number
}

// User Presence
export interface UserPresence {
  id: string
  name: string
  color: string
  cursor?: { x: number; y: number }
  tool?: DrawingTool
  lastSeen: number
}

// WebSocket Message Types
export interface WSMessage {
  type: 'cursor' | 'stroke' | 'element' | 'presence' | 'clear' | 'undo' | 'redo'
  whiteboardId: string
  userId: string
  data: unknown
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface WhiteboardListResponse {
  whiteboards: Whiteboard[]
  total: number
}

// File Upload Types
export interface UploadOptions {
  whiteboardId: string
  file: File
  onProgress?: (progress: number) => void
}

export interface UploadProgress {
  loaded: number
  total: number
  percent: number
}

export interface UploadResult {
  fileId: string
  fileName: string
  storagePath: string
  url: string
  fileRecord?: {
    id: string
    file_name: string
    file_type: string
    storage_path: string
    file_size: number
  }
}

// Color Palette
export const COLORS = [
  '#000000', // Black
  '#374151', // Gray 700
  '#6B7280', // Gray 500
  '#EF4444', // Red 500
  '#F59E0B', // Amber 500
  '#10B981', // Emerald 500
  '#3B82F6', // Blue 500
  '#8B5CF6', // Violet 500
  '#EC4899', // Pink 500
] as const

export const TOOL_SIZES = [1, 2, 4, 8, 12, 16, 24, 32] as const

// PDF.js Types
export interface PDFDocumentProxy {
  numPages: number
  getPage: (pageNumber: number) => Promise<PDFPageProxy>
  cleanup: () => void
  destroy: () => void
}

export interface PDFRenderTask {
  promise: Promise<void>
  cancel: () => void
}

export interface PDFPageProxy {
  getViewport: (options: { scale: number }) => PDFPageViewport
  render: (options: {
    canvasContext: CanvasRenderingContext2D
    viewport: PDFPageViewport
  }) => PDFRenderTask
}

export interface PDFPageViewport {
  width: number
  height: number
}

export interface PDFRenderOptions {
  scale?: number
  onProgress?: (percent: number) => void
}

export interface PDFLoadingState {
  loading: boolean
  loaded: number
  total: number
  percent: number
  error?: string
}

// Document Layer Types
export interface DocumentLayer {
  id: string
  type: 'pdf' | 'image'
  fileId: string
  src: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  opacity: number
  visible: boolean
  pageNumber?: number
  totalPages?: number
}

export interface DocumentLayerState {
  layers: DocumentLayer[]
  activeLayerId: string | null
  loading: boolean
  error: string | null
}
