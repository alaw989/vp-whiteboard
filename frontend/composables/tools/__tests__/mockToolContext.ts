import { ref } from 'vue'
import { vi } from 'vitest'
import type { ToolContext } from '~/composables/useToolHandlers'
import type { CanvasElement, DrawingTool } from '~/types'

export function createMockToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  const base: ToolContext = {
    userId: 'test-user',
    userName: 'Test User',
    currentTool: 'select' as DrawingTool,
    currentColor: '#000000',
    currentSize: 2,
    filletRadius: ref(10),
    elements: [],

    isDrawing: ref(false),
    viewport: ref({ x: 0, y: 0, zoom: 1 }),
    stageRef: ref(null),
    layerRef: ref(null),
    currentPressure: ref(0.5),
    currentPointerType: ref('mouse'),

    getPointerPos: vi.fn((evt: any) => ({ x: evt?.clientX ?? 0, y: evt?.clientY ?? 0 })),
    getStagePointerPos: vi.fn(() => ({ x: 0, y: 0 })),

    emitElementAdd: vi.fn(),
    emitElementDelete: vi.fn(),
    emitElementUpdate: vi.fn(),
    emitCursorUpdate: vi.fn(),

    activeLayerId: 'default',

    currentSnapPoint: ref(null),
    findSnapPoint: vi.fn((pos) => null),

    constrainPoint: vi.fn((_origin, cursor) => cursor),
    polarTrackingResult: ref(null),
    applyDirectDistance: vi.fn(),

    setCursor: vi.fn(),
    clearCursor: vi.fn(),

    isMeasuring: ref(false),
    measurementStart: ref(null),
    currentMeasurementEnd: ref(null),
    previewLine: ref(null),
    startDistanceMeasurement: vi.fn(),
    updateMeasurementPreview: vi.fn(),
    completeDistanceMeasurement: vi.fn(),
    cancelMeasurement: vi.fn(),
    measureArea: vi.fn(() => false),

    selectedId: ref(null),
    selectElementAtPosition: vi.fn(() => false),
    isRubberBanding: ref(false),
    selectionRect: ref(null),
    startRubberBand: vi.fn(),
    updateRubberBand: vi.fn(),
    endRubberBand: vi.fn(),

    pixelsPerInch: 96,
    measurementUnit: 'inches',

    isPanning: ref(false),
    enablePan: vi.fn(),
    disablePan: vi.fn(),
    setViewportDirect: vi.fn(),
    panStartPointer: ref(null),
    panStartViewport: ref(null),

    ...overrides,
  }

  return base
}

export function createMockStageRef() {
  const mockNode = {
    getAllIntersections: vi.fn(() => []),
    id: vi.fn(() => ''),
    name: vi.fn(() => ''),
    getParent: vi.fn(() => mockNode),
    getNode: vi.fn(() => mockNode),
    attrs: {},
  }
  return { value: mockNode }
}

export function createSampleElement(overrides: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id: 'el-1',
    type: 'line',
    userId: 'user-a',
    userName: 'User A',
    timestamp: Date.now(),
    data: {
      start: [100, 100] as [number, number],
      end: [200, 200] as [number, number],
      color: '#000000',
      size: 2,
    },
    ...overrides,
  } as CanvasElement
}
