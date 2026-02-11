import { getStroke } from 'perfect-freehand'
import type { StrokeElement, DrawingTool, ToolSettings } from '~/types'

export function useDrawingTools() {
  // Current tool settings
  const toolSettings = ref<ToolSettings>({
    tool: 'pen',
    color: '#000000',
    size: 4,
    opacity: 1,
  })

  // Current stroke being drawn
  const currentStroke = ref<[number, number, number][]>([])
  const isDrawing = ref(false)

  // Set current tool
  function setTool(tool: DrawingTool) {
    toolSettings.value.tool = tool
  }

  // Set color
  function setColor(color: string) {
    toolSettings.value.color = color
  }

  // Set size
  function setSize(size: number) {
    toolSettings.value.size = size
  }

  // Set opacity
  function setOpacity(opacity: number) {
    toolSettings.value.opacity = opacity
  }

  // Start drawing
  function startStroke(x: number, y: number, pressure = 0.5) {
    isDrawing.value = true
    currentStroke.value = [[x, y, pressure]]
  }

  // Continue stroke
  function continueStroke(x: number, y: number, pressure = 0.5) {
    if (!isDrawing.value) return
    currentStroke.value.push([x, y, pressure])
  }

  // End stroke and return stroke data (or null for eraser)
  function endStroke(): StrokeElement | { isEraser: true; x: number; y: number } | null {
    if (!isDrawing.value || currentStroke.value.length < 2) {
      isDrawing.value = false
      currentStroke.value = []
      return null
    }

    // Handle eraser - returns position for hit detection
    if (toolSettings.value.tool === 'eraser') {
      const lastPoint = currentStroke.value[currentStroke.value.length - 1]
      isDrawing.value = false
      currentStroke.value = []
      return { isEraser: true, x: lastPoint[0], y: lastPoint[1] }
    }

    const stroke: StrokeElement = {
      points: currentStroke.value,
      color: toolSettings.value.color,
      size: toolSettings.value.size,
      tool: toolSettings.value.tool === 'highlighter' ? 'highlighter' : 'pen',
      smooth: true,
    }

    isDrawing.value = false
    currentStroke.value = []

    return stroke
  }

  // Render stroke to SVG path using perfect-freehand
  function strokeToSvgPath(stroke: StrokeElement): string {
    const { points, size } = stroke

    if (points.length < 2) return ''

    // Get stroke outline points
    const outlinePoints = getStroke(points, {
      size: stroke.size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    })

    if (outlinePoints.length < 2) return ''

    // Convert to SVG path
    const [first, ...rest] = outlinePoints
    let path = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`

    for (const point of rest) {
      path += ` L ${point[0].toFixed(2)} ${point[1].toFixed(2)}`
    }

    path += ' Z'

    return path
  }

  // Get stroke bounding box
  function getStrokeBounds(stroke: StrokeElement) {
    if (stroke.points.length === 0) return null

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const [x, y] of stroke.points) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }

  // Simplify stroke (reduce points for performance)
  function simplifyStroke(points: [number, number, number][], tolerance = 2): [number, number, number][] {
    if (points.length <= 2) return points

    const simplified: [number, number, number][] = [points[0]]

    for (let i = 1; i < points.length - 1; i++) {
      const prev = simplified[simplified.length - 1]
      const curr = points[i]
      const next = points[i + 1]

      // Distance from prev to curr
      const dist1 = Math.sqrt(
        Math.pow(curr[0] - prev[0], 2) + Math.pow(curr[1] - prev[1], 2)
      )

      // Distance from curr to next
      const dist2 = Math.sqrt(
        Math.pow(next[0] - curr[0], 2) + Math.pow(next[1] - curr[1], 2)
      )

      // Keep point if it's significant
      if (dist1 > tolerance || dist2 > tolerance) {
        simplified.push(curr)
      }
    }

    simplified.push(points[points.length - 1])

    return simplified
  }

  /**
   * Render perfect-freehand stroke to Konva-compatible polygon points
   * Returns the outline points for a filled shape (not just a line)
   */
  function renderStroke(stroke: StrokeElement): { points: number[]; bbox: { x: number; y: number; width: number; height: number } } {
    const { points, size } = stroke

    if (points.length < 2) {
      return { points: [], bbox: { x: 0, y: 0, width: 0, height: 0 } }
    }

    // Get stroke outline using perfect-freehand
    const outline = getStroke(points, {
      size: stroke.size,
      thinning: stroke.tool === 'highlighter' ? 0 : 0.5,
      smoothing: 0.5,
      streamline: 0.5,
    })

    // Calculate bounding box
    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of outline) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }

    // Flatten outline points for Konva Line/ Polygon
    const flatPoints = outline.flatMap(p => [p[0], p[1]])

    return {
      points: flatPoints,
      bbox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    }
  }

  return {
    // State
    toolSettings,
    currentStroke,
    isDrawing,

    // Methods
    setTool,
    setColor,
    setSize,
    setOpacity,
    startStroke,
    continueStroke,
    endStroke,
    strokeToSvgPath,
    getStrokeBounds,
    simplifyStroke,
    renderStroke,
  }
}
