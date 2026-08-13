// Pure vector-drawing layer for PDF export.
//
// Converts CanvasElement data into jsPDF vector primitives so shapes stay crisp
// when the exported PDF is zoomed or printed (the raster PNG is kept as the
// background for image/document layers). No Konva imports — fully unit-testable.
import type jsPDF from 'jspdf'
import { GState } from 'jspdf'
import { getStroke } from 'perfect-freehand'
import type {
  ArcElement,
  ArrowElement,
  CanvasElement,
  CircleElement,
  DimensionElement,
  EllipseElement,
  FilletArcElement,
  LineElement,
  MeasurementDistanceElement,
  PolylineElement,
  RectangleElement,
  RevisionCloudElement,
  StampElement,
  StrokeElement,
  TextAnnotationElement,
  TextElement,
} from '~/types'
import { arcToPolylinePoints, revisionCloudPath } from '~/utils/geometryUtils'
import type { Point } from '~/utils/geometryUtils'

const KAPPA = 0.5522847498307936 // 4/3 * (Math.SQRT2 - 1) — ellipse bezier constant

export interface Cubic {
  start: Point
  cp1: Point
  cp2: Point
  end: Point
}

function rotatePoint(p: Point, cx: number, cy: number, angle: number): Point {
  const s = Math.sin(angle)
  const c = Math.cos(angle)
  const dx = p.x - cx
  const dy = p.y - cy
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }
}

/** Approximate a circular arc (center/radius/sweep) as ≤90° cubic bezier segments. */
export function arcToCubics(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  sweep: number,
): Cubic[] {
  if (r <= 0 || Math.abs(sweep) < 1e-9) return []
  const segments = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)))
  const step = sweep / segments
  const cubics: Cubic[] = []
  for (let i = 0; i < segments; i++) {
    const a0 = startAngle + step * i
    const a1 = a0 + step
    const theta = a1 - a0
    const k = (4 / 3) * Math.tan(theta / 4)
    const p0 = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) }
    const p3 = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) }
    cubics.push({
      start: p0,
      cp1: { x: p0.x + k * r * -Math.sin(a0), y: p0.y + k * r * Math.cos(a0) },
      cp2: { x: p3.x - k * r * -Math.sin(a1), y: p3.y - k * r * Math.cos(a1) },
      end: p3,
    })
  }
  return cubics
}

/** Four cubic bezier quadrants for an (optionally rotated) ellipse. */
export function ellipseToCubics(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation = 0,
): Cubic[] {
  if (rx <= 0 || ry <= 0) return []
  const ox = KAPPA * rx
  const oy = KAPPA * ry
  const pts: Point[] = [
    { x: cx + rx, y: cy },
    { x: cx + rx, y: cy - oy },
    { x: cx + ox, y: cy - ry },
    { x: cx, y: cy - ry },
    { x: cx - ox, y: cy - ry },
    { x: cx - rx, y: cy - oy },
    { x: cx - rx, y: cy },
    { x: cx - rx, y: cy + oy },
    { x: cx - ox, y: cy + ry },
    { x: cx, y: cy + ry },
    { x: cx + ox, y: cy + ry },
    { x: cx + rx, y: cy + oy },
  ]
  if (rotation !== 0) {
    for (const p of pts) {
      const r = rotatePoint(p, cx, cy, rotation)
      p.x = r.x
      p.y = r.y
    }
  }
  return [
    { start: pts[0]!, cp1: pts[1]!, cp2: pts[2]!, end: pts[3]! },
    { start: pts[3]!, cp1: pts[4]!, cp2: pts[5]!, end: pts[6]! },
    { start: pts[6]!, cp1: pts[7]!, cp2: pts[8]!, end: pts[9]! },
    { start: pts[9]!, cp1: pts[10]!, cp2: pts[11]!, end: pts[0]! },
  ]
}

function pathPolyline(pdf: jsPDF, pts: Point[], closed: boolean): void {
  if (pts.length < 2) return
  pdf.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length; i++) pdf.lineTo(pts[i]!.x, pts[i]!.y)
  if (closed && pts.length > 2) pdf.close()
}

function strokePolyline(pdf: jsPDF, pts: Point[], closed: boolean): void {
  pathPolyline(pdf, pts, closed)
  pdf.stroke()
}

function fillStrokePolyline(pdf: jsPDF, pts: Point[], closed: boolean): void {
  pathPolyline(pdf, pts, closed)
  pdf.fillStroke()
}

function pathCubics(pdf: jsPDF, cubics: Cubic[], closed: boolean): void {
  if (cubics.length === 0) return
  pdf.moveTo(cubics[0]!.start.x, cubics[0]!.start.y)
  for (const c of cubics) pdf.curveTo(c.cp1.x, c.cp1.y, c.cp2.x, c.cp2.y, c.end.x, c.end.y)
  if (closed) pdf.close()
}

function strokeCubics(pdf: jsPDF, cubics: Cubic[], closed: boolean): void {
  pathCubics(pdf, cubics, closed)
  pdf.stroke()
}

function fillStrokeCubics(pdf: jsPDF, cubics: Cubic[], closed: boolean): void {
  pathCubics(pdf, cubics, closed)
  pdf.fillStroke()
}

function setStrokeStyle(pdf: jsPDF, color: string, width: number): void {
  pdf.setDrawColor(color)
  pdf.setLineWidth(Math.max(width, 0.01))
  pdf.setLineCap('round')
  pdf.setLineJoin('round')
}

function setFillStyle(pdf: jsPDF, color: string): void {
  pdf.setFillColor(color)
}

// --- Element renderers ---

function drawStroke(pdf: jsPDF, data: StrokeElement): void {
  if (data.points.length < 2) return
  const outline = getStroke(data.points, {
    size: data.size,
    thinning: data.tool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })
  if (outline.length < 2) return
  setStrokeStyle(pdf, data.color, 1)
  setFillStyle(pdf, data.color)
  pdf.setGState(new GState({ opacity: data.tool === 'highlighter' ? 0.5 : 1 }))
  fillStrokePolyline(pdf, outline.map(([x, y]) => ({ x, y })), true)
  pdf.setGState(new GState({ opacity: 1 }))
}

function drawLine(pdf: jsPDF, data: LineElement): void {
  setStrokeStyle(pdf, data.color, data.size)
  pdf.line(data.start[0], data.start[1], data.end[0], data.end[1])
}

function drawRectangle(pdf: jsPDF, data: RectangleElement): void {
  setStrokeStyle(pdf, data.stroke, data.strokeWidth)
  const x = data.width >= 0 ? data.x : data.x + data.width
  const y = data.height >= 0 ? data.y : data.y + data.height
  const w = Math.abs(data.width)
  const h = Math.abs(data.height)
  if (data.fill) {
    setFillStyle(pdf, data.fill)
    pdf.rect(x, y, w, h, 'FD')
  } else {
    pdf.rect(x, y, w, h, 'S')
  }
}

function drawCircle(pdf: jsPDF, data: CircleElement): void {
  setStrokeStyle(pdf, data.stroke, data.strokeWidth)
  if (data.fill) {
    setFillStyle(pdf, data.fill)
    pdf.circle(data.cx, data.cy, data.radius, 'FD')
  } else {
    pdf.circle(data.cx, data.cy, data.radius, 'S')
  }
}

function drawEllipse(pdf: jsPDF, data: EllipseElement): void {
  setStrokeStyle(pdf, data.stroke, data.strokeWidth)
  if (data.rotation === 0) {
    if (data.fill) {
      setFillStyle(pdf, data.fill)
      pdf.ellipse(data.x, data.y, data.radiusX, data.radiusY, 'FD')
    } else {
      pdf.ellipse(data.x, data.y, data.radiusX, data.radiusY, 'S')
    }
  } else {
    const cubics = ellipseToCubics(data.x, data.y, data.radiusX, data.radiusY, data.rotation)
    if (data.fill) {
      setFillStyle(pdf, data.fill)
      fillStrokeCubics(pdf, cubics, true)
    } else {
      strokeCubics(pdf, cubics, true)
    }
  }
}

function drawPolyline(pdf: jsPDF, data: PolylineElement): void {
  setStrokeStyle(pdf, data.color, data.size)
  strokePolyline(pdf, data.points.map(([x, y]) => ({ x, y })), data.closed)
}

function drawArc(pdf: jsPDF, data: ArcElement): void {
  setStrokeStyle(pdf, data.color, data.size)
  const pts = arcToPolylinePoints(data.start, data.through, data.end, 64)
  strokePolyline(pdf, pts, false)
}

function drawFilletArc(pdf: jsPDF, data: FilletArcElement): void {
  setStrokeStyle(pdf, data.color, data.size)
  // Shortest-arc sweep, matching the on-canvas renderer.
  let sweep = data.endAngle - data.startAngle
  if (sweep > Math.PI) sweep -= 2 * Math.PI
  if (sweep < -Math.PI) sweep += 2 * Math.PI
  const cubics = arcToCubics(data.center[0], data.center[1], data.radius, data.startAngle, sweep)
  strokeCubics(pdf, cubics, false)
}

function drawRevisionCloud(pdf: jsPDF, data: RevisionCloudElement): void {
  setStrokeStyle(pdf, data.color, data.size)
  const flat = revisionCloudPath(
    data.points.map(p => ({ x: p[0], y: p[1] })),
    data.arcLength,
    data.closed,
  )
  const pts: Point[] = []
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i]!, y: flat[i + 1]! })
  strokePolyline(pdf, pts, data.closed)
}

function drawArrow(pdf: jsPDF, data: ArrowElement): void {
  const pts = data.points.map(([x, y]) => ({ x, y }))
  if (pts.length < 2) return
  setStrokeStyle(pdf, data.stroke, data.strokeWidth)
  if (pts.length === 2) {
    pdf.line(pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y)
  } else {
    strokePolyline(pdf, pts, false)
  }
  // Arrowhead triangle at the tip (last point), perpendicular to the final segment.
  const tail = pts[pts.length - 2]!
  const tip = pts[pts.length - 1]!
  const dx = tip.x - tail.x
  const dy = tip.y - tail.y
  const len = Math.hypot(dx, dy)
  if (len > 0) {
    const ux = dx / len
    const uy = dy / len
    const px = -uy
    const py = ux
    const headLen = data.pointerLength || 10
    const halfW = (data.pointerWidth || 10) / 2
    const base = { x: tip.x - ux * headLen, y: tip.y - uy * headLen }
    setFillStyle(pdf, data.fill)
    pdf.triangle(
      tip.x, tip.y,
      base.x + px * halfW, base.y + py * halfW,
      base.x - px * halfW, base.y - py * halfW,
      'F',
    )
  }
}

interface DimensionLineParts {
  dimLineStart: Point
  dimLineEnd: Point
  extStart1: Point
  extStart2: Point
  extEnd1: Point
  extEnd2: Point
}

function getDimensionLineParts(
  start: [number, number],
  end: [number, number],
  offset: number,
): DimensionLineParts {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const len = Math.hypot(dx, dy)
  if (len === 0) {
    return {
      dimLineStart: { x: start[0], y: start[1] + offset },
      dimLineEnd: { x: end[0], y: end[1] + offset },
      extStart1: { x: start[0], y: start[1] },
      extStart2: { x: start[0], y: start[1] + offset },
      extEnd1: { x: end[0], y: end[1] },
      extEnd2: { x: end[0], y: end[1] + offset },
    }
  }
  const nx = -dy / len
  const ny = dx / len
  const extOvershoot = 6
  const extEnd1Offset = offset >= 0 ? offset + extOvershoot : offset - extOvershoot
  return {
    dimLineStart: { x: start[0] + nx * offset, y: start[1] + ny * offset },
    dimLineEnd: { x: end[0] + nx * offset, y: end[1] + ny * offset },
    extStart1: { x: start[0], y: start[1] },
    extStart2: { x: start[0] + nx * extEnd1Offset, y: start[1] + ny * extEnd1Offset },
    extEnd1: { x: end[0], y: end[1] },
    extEnd2: { x: end[0] + nx * extEnd1Offset, y: end[1] + ny * extEnd1Offset },
  }
}

function drawDimension(pdf: jsPDF, data: DimensionElement): void {
  const parts = getDimensionLineParts(data.start, data.end, data.offset)
  const strokeWidth = Math.max(data.size, 1)
  const thinWidth = Math.max(strokeWidth * 0.5, 0.5)
  const tickSize = 6

  setStrokeStyle(pdf, data.color, strokeWidth)
  pdf.line(parts.dimLineStart.x, parts.dimLineStart.y, parts.dimLineEnd.x, parts.dimLineEnd.y)

  setStrokeStyle(pdf, data.color, thinWidth)
  pdf.line(parts.extStart1.x, parts.extStart1.y, parts.extStart2.x, parts.extStart2.y)
  pdf.line(parts.extEnd1.x, parts.extEnd1.y, parts.extEnd2.x, parts.extEnd2.y)

  setStrokeStyle(pdf, data.color, strokeWidth)
  const dx = parts.dimLineEnd.x - parts.dimLineStart.x
  const dy = parts.dimLineEnd.y - parts.dimLineStart.y
  const dl = Math.hypot(dx, dy) || 1
  const nx = -dy / dl
  const ny = dx / dl
  pdf.line(
    parts.dimLineStart.x + nx * tickSize, parts.dimLineStart.y + ny * tickSize,
    parts.dimLineStart.x - nx * tickSize, parts.dimLineStart.y - ny * tickSize,
  )
  pdf.line(
    parts.dimLineEnd.x + nx * tickSize, parts.dimLineEnd.y + ny * tickSize,
    parts.dimLineEnd.x - nx * tickSize, parts.dimLineEnd.y - ny * tickSize,
  )

  const midX = (parts.dimLineStart.x + parts.dimLineEnd.x) / 2
  const midY = (parts.dimLineStart.y + parts.dimLineEnd.y) / 2
  const pixelDist = Math.hypot(data.end[0] - data.start[0], data.end[1] - data.start[1])
  const inches = pixelDist / data.pixelsPerInch
  const value = data.value ?? (data.unit === 'feet' ? +(inches / 12).toFixed(data.precision) : +(inches).toFixed(data.precision))
  const text = `${value}${data.unit === 'feet' ? ' ft' : ' in'}`
  let angle = Math.atan2(data.end[1] - data.start[1], data.end[0] - data.start[0]) * 180 / Math.PI
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180
  pdf.setFont('courier')
  pdf.setFontSize(12)
  pdf.setTextColor(data.color)
  pdf.text(text, midX, midY, { align: 'center', angle, baseline: 'middle' })
}

function drawStamp(pdf: jsPDF, data: StampElement): void {
  setStrokeStyle(pdf, data.borderColor, 2)
  setFillStyle(pdf, data.backgroundColor)
  pdf.roundedRect(data.x, data.y, data.width, data.height, data.borderRadius, data.borderRadius, 'FD')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(data.fontSize)
  pdf.setTextColor(data.textColor)
  pdf.text(data.text, data.x + data.width / 2, data.y + data.height / 2, { align: 'center', baseline: 'middle' })
}

function drawText(pdf: jsPDF, data: TextElement): void {
  pdf.setFontSize(data.fontSize)
  pdf.setTextColor(data.color)
  pdf.text(data.text, data.x, data.y)
}

function drawTextAnnotation(pdf: jsPDF, data: TextAnnotationElement): void {
  const start = data.leaderLine.start
  const end = data.leaderLine.end
  setStrokeStyle(pdf, data.color, 2)
  pdf.line(start[0], start[1], end[0], end[1])
  pdf.setFontSize(data.fontSize)
  pdf.setTextColor(data.color)
  pdf.text(data.text, end[0], end[1] + 20)
}

function drawMeasurementDistance(pdf: jsPDF, data: MeasurementDistanceElement): void {
  const color = '#3B82F6'
  setStrokeStyle(pdf, color, 2)
  pdf.line(data.start[0], data.start[1], data.end[0], data.end[1])
  setFillStyle(pdf, color)
  pdf.circle(data.start[0], data.start[1], 5, 'F')
  pdf.circle(data.end[0], data.end[1], 5, 'F')
  const inches = data.value ?? Math.hypot(data.end[0] - data.start[0], data.end[1] - data.start[1]) / data.pixelsPerInch
  const label = data.unit === 'feet'
    ? `${(inches / 12).toFixed(data.precision)}'`
    : `${inches.toFixed(data.precision)}"`
  const midX = (data.start[0] + data.end[0]) / 2
  const midY = (data.start[1] + data.end[1]) / 2
  pdf.setFontSize(14)
  pdf.setTextColor(color)
  pdf.text(label, midX, midY - 15, { align: 'center' })
}

// --- Dispatcher ---

export function drawElementToPdf(pdf: jsPDF, element: CanvasElement): void {
  switch (element.type) {
    case 'stroke':
      drawStroke(pdf, element.data as StrokeElement)
      break
    case 'line':
      drawLine(pdf, element.data as LineElement)
      break
    case 'rectangle':
      drawRectangle(pdf, element.data as RectangleElement)
      break
    case 'circle':
      drawCircle(pdf, element.data as CircleElement)
      break
    case 'ellipse':
      drawEllipse(pdf, element.data as EllipseElement)
      break
    case 'polyline':
      drawPolyline(pdf, element.data as PolylineElement)
      break
    case 'arc':
      drawArc(pdf, element.data as ArcElement)
      break
    case 'fillet-arc':
      drawFilletArc(pdf, element.data as FilletArcElement)
      break
    case 'revision-cloud':
      drawRevisionCloud(pdf, element.data as RevisionCloudElement)
      break
    case 'arrow':
      drawArrow(pdf, element.data as ArrowElement)
      break
    case 'dimension':
      drawDimension(pdf, element.data as DimensionElement)
      break
    case 'stamp':
      drawStamp(pdf, element.data as StampElement)
      break
    case 'text':
      drawText(pdf, element.data as TextElement)
      break
    case 'text-annotation':
      drawTextAnnotation(pdf, element.data as TextAnnotationElement)
      break
    case 'measurement-distance':
      drawMeasurementDistance(pdf, element.data as MeasurementDistanceElement)
      break
    default:
      // 'image' and 'measurement-area' (and any unknown type) are already
      // rasterized into the PNG background — nothing to draw.
      break
  }
}

/**
 * Draw every vectorizable element onto an existing jsPDF document on top of the
 * raster background. Malformed elements are skipped rather than aborting.
 */
export function drawElementsToPdf(pdf: jsPDF, elements: CanvasElement[]): void {
  for (const element of elements) {
    try {
      drawElementToPdf(pdf, element)
    } catch {
      // skip
    }
  }
}
