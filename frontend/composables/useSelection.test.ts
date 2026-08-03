import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useSelection } from './useSelection'
import type { CanvasElement } from '~/types'

function makeParentNode(elementId: string) {
  return {
    id: vi.fn(() => elementId),
    className: 'Shape',
    getParent: vi.fn(() => ({
      name: vi.fn(() => 'canvasLayer'),
      getParent: vi.fn(() => ({})),
    })),
  }
}

function createMockStage() {
  const shape1 = {
    id: vi.fn(() => 'el-1'),
    getParent: vi.fn(() => makeParentNode('el-1')),
    getClientRect: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
    draggable: vi.fn(),
  }

  const shape2 = {
    id: vi.fn(() => 'el-2'),
    getParent: vi.fn(() => makeParentNode('el-2')),
    getClientRect: vi.fn(() => ({ x: 200, y: 200, width: 100, height: 100 })),
    draggable: vi.fn(),
  }

  const transformerNode = {
    nodes: vi.fn(),
    moveToTop: vi.fn(),
    getNode: vi.fn(function () { return this }),
  }

  const stage = {
    getAllIntersections: vi.fn(({ x, y }: { x: number; y: number }) => {
      const hits: any[] = []
      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) hits.push(shape1)
      if (x >= 200 && x <= 300 && y >= 200 && y <= 300) hits.push(shape2)
      if (x >= 0 && x <= 500 && y >= 0 && y <= 500 && hits.length === 0) {
        hits.push(shape1, shape2)
      }
      return hits
    }),
    find: vi.fn((selector: string) => {
      if (selector === 'Shape') return [shape1, shape2]
      if (selector === `#${CSS.escape('el-1')}`) return [shape1]
      if (selector === `#${CSS.escape('el-2')}`) return [shape2]
      return []
    }),
    forEach: vi.fn((fn: any) => { [shape1, shape2].forEach(fn) }),
    getNode: vi.fn(function () { return this }),
  }

  return { shape1, shape2, transformerNode, stage }
}

describe('useSelection', () => {
  it('selectElementAtPosition with multiple elements returns the element at position', () => {
    const { stage } = createMockStage()
    const elements = ref<CanvasElement[]>([
      { id: 'el-1', type: 'rectangle', userId: 'u1', userName: 'U1', timestamp: 0, data: { x: 0, y: 0, width: 100, height: 100, stroke: '#000', strokeWidth: 1 } },
    ] as any)
    const { selectElementAtPosition, selectedId } = useSelection(ref(stage), elements)

    const result = selectElementAtPosition(50, 50)

    expect(result).toBe(true)
    expect(selectedId.value).toBe('el-1')
  })

  it('selectElementAtPosition with no elements near position returns false', () => {
    const stage = {
      getAllIntersections: vi.fn(() => []),
      getNode: vi.fn(function () { return this }),
    }
    const elements = ref<CanvasElement[]>([])
    const { selectElementAtPosition, selectedId } = useSelection(ref(stage), elements)

    const result = selectElementAtPosition(9999, 9999)

    expect(result).toBe(false)
    expect(selectedId.value).toBeNull()
  })

  it('startRubberBand sets selectionRect and isRubberBanding', () => {
    const { stage } = createMockStage()
    const elements = ref<CanvasElement[]>([])
    const { startRubberBand, isRubberBanding, selectionRect } = useSelection(ref(stage), elements)

    startRubberBand(100, 200)

    expect(isRubberBanding.value).toBe(true)
    expect(selectionRect.value).toEqual({ x: 100, y: 200, width: 0, height: 0 })
  })

  it('updateRubberBand expands selectionRect', () => {
    const { stage } = createMockStage()
    const elements = ref<CanvasElement[]>([])
    const { startRubberBand, updateRubberBand, selectionRect } = useSelection(ref(stage), elements)

    startRubberBand(100, 200)
    updateRubberBand(300, 400)

    expect(selectionRect.value).toEqual({ x: 100, y: 200, width: 200, height: 200 })
  })

  it('endRubberBand selects elements within the rect', () => {
    const mock = createMockStage()
    const elements = ref<CanvasElement[]>([
      { id: 'el-1', type: 'rectangle', userId: 'u1', userName: 'U1', timestamp: 0, data: { x: 0, y: 0, width: 100, height: 100, stroke: '#000', strokeWidth: 1 } },
      { id: 'el-2', type: 'rectangle', userId: 'u2', userName: 'U2', timestamp: 0, data: { x: 200, y: 200, width: 100, height: 100, stroke: '#000', strokeWidth: 1 } },
    ] as any)
    const { startRubberBand, updateRubberBand, endRubberBand, selectedId, selectedIds } = useSelection(ref(mock.stage), elements)

    startRubberBand(0, 0)
    updateRubberBand(150, 150)
    endRubberBand()

    expect(selectedId.value).toBe('el-1')
    expect(selectedIds.value.has('el-1')).toBe(true)
    expect(selectedIds.value.has('el-2')).toBe(false)
  })

  it('shift-click adds to selection (multi-select)', () => {
    const mock = createMockStage()
    const elements = ref<CanvasElement[]>([
      { id: 'el-1', type: 'rectangle', userId: 'u1', userName: 'U1', timestamp: 0, data: { x: 0, y: 0, width: 100, height: 100, stroke: '#000', strokeWidth: 1 } },
      { id: 'el-2', type: 'rectangle', userId: 'u2', userName: 'U2', timestamp: 0, data: { x: 200, y: 200, width: 100, height: 100, stroke: '#000', strokeWidth: 1 } },
    ] as any)
    const { selectElementAtPosition, selectedId, selectedIds } = useSelection(ref(mock.stage), elements)

    selectElementAtPosition(50, 50, false)
    selectElementAtPosition(250, 250, true)

    expect(selectedIds.value.has('el-1')).toBe(true)
    expect(selectedIds.value.has('el-2')).toBe(true)
    expect(selectedId.value).toBe('el-1')
  })

  it('selectedId ref updates correctly', () => {
    const mock = createMockStage()
    const elements = ref<CanvasElement[]>([
      { id: 'el-1', type: 'rectangle', userId: 'u1', userName: 'U1', timestamp: 0, data: { x: 0, y: 0, width: 100, height: 100, stroke: '#000', strokeWidth: 1 } },
    ] as any)
    const { selectElementAtPosition, selectedId } = useSelection(ref(mock.stage), elements)

    selectElementAtPosition(50, 50)
    expect(selectedId.value).toBe('el-1')

    selectElementAtPosition(250, 250, true)
    expect(selectedId.value).toBe('el-1')
  })

  it('deselect clears selectedId and selectedIds', () => {
    const mock = createMockStage()
    const elements = ref<CanvasElement[]>([])
    const { deselect, selectElementAtPosition, selectedId, selectedIds } = useSelection(ref(mock.stage), elements)

    selectedIds.value = new Set(['el-1'])
    selectedId.value = 'el-1'
    deselect()

    expect(selectedId.value).toBeNull()
    expect(selectedIds.value.size).toBe(0)
  })

  it('deleteSelected returns id and deselects', () => {
    const mock = createMockStage()
    const elements = ref<CanvasElement[]>([])
    const { deleteSelected, selectedId, deselect } = useSelection(ref(mock.stage), elements)

    selectedId.value = 'el-1'
    const result = deleteSelected()

    expect(result).toBe('el-1')
    expect(selectedId.value).toBeNull()
  })
})
