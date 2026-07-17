import { ref, computed, watch, type Ref } from 'vue'
import type { CanvasElement } from '~/types'

export function useSelection(stageRef: Ref<any>, elements: Ref<CanvasElement[]>) {
  // Selection state (single + multi)
  const selectedId = ref<string | null>(null)
  const selectedIds = ref<Set<string>>(new Set())
  const transformerRef = ref<any>(null)
  // Rubber-band selection state
  const selectionRect = ref<{ x: number; y: number; width: number; height: number } | null>(null)
  const isRubberBanding = ref(false)
  const rubberBandStart = ref<{ x: number; y: number } | null>(null)

  // Get the selected element (primary, for backward compat)
  const selectedElement = computed(() =>
    elements.value.find(el => el.id === selectedId.value)
  )

  // Check if an element is currently selected
  const hasSelection = computed(() => selectedIds.value.size > 0)

  /**
   * Update the transformer to wrap currently selected nodes
   */
  function updateTransformer() {
    const transformer = transformerRef.value?.getNode()
    const stage = stageRef.value?.getNode()
    if (!transformer || !stage) return

    // Collect all selected nodes from the stage
    const nodes: any[] = []
    selectedIds.value.forEach(id => {
      const found = stage.find(`#${CSS.escape(id)}`)
      if (found.length > 0) {
        const node = found[0].getParent()?.className === 'Group' ? found[0].getParent() : found[0]
        node.draggable(true)
        nodes.push(node)
      }
    })

    if (nodes.length > 0) {
      transformer.nodes(nodes)
      transformer.moveToTop()
    } else {
      transformer.nodes([])
    }
  }

  /**
   * Select an element (replaces current selection, or toggles if shift)
   */
  function selectElement(id: string, node: any, shiftKey?: boolean) {
    if (shiftKey && selectedIds.value.has(id)) {
      // Remove from selection
      selectedIds.value.delete(id)
      node.draggable(false)
    } else if (shiftKey) {
      // Add to selection
      selectedIds.value.add(id)
      node.draggable(true)
    } else {
      // Single select (replace)
      // Disable drag on previously selected
      const stage = stageRef.value?.getNode()
      stage?.find('Shape').forEach((s: any) => s.draggable(false))
      stage?.find('Group').forEach((g: any) => g.draggable(false))
      selectedIds.value = new Set([id])
      node.draggable(true)
    }

    selectedId.value = shiftKey ? (selectedIds.value.size > 0 ? Array.from(selectedIds.value)[0]! : null) : id
    updateTransformer()
  }

  /**
   * Deselect all elements
   */
  function deselect() {
    const transformer = transformerRef.value?.getNode()
    const stage = stageRef.value?.getNode()

    if (transformer) {
      transformer.nodes([])
      stage?.find('Shape').forEach((shape: any) => shape.draggable(false))
      stage?.find('Group').forEach((group: any) => group.draggable(false))
    }

    selectedId.value = null
    selectedIds.value = new Set()
    selectionRect.value = null
  }

  /**
   * Delete the selected element (primary)
   */
  function deleteSelected(): string | null {
    if (selectedId.value) {
      const id = selectedId.value
      deselect()
      return id
    }
    return null
  }

  /**
   * Find and select element by stage position
   */
  function selectElementAtPosition(x: number, y: number, shiftKey?: boolean): boolean {
    const stage = stageRef.value?.getNode()
    if (!stage) return false

    const shapes = stage.getAllIntersections({ x, y }).reverse()

    const canvasShapes = shapes.filter((shape: any) => {
      const parent = shape.getParent()
      const layer = parent?.getParent()
      const layerName = layer?.name()
      return layerName !== 'documentLayer' && layerName !== 'transformerLayer'
    })

    if (canvasShapes.length > 0) {
      const shape = canvasShapes[0]
      const elementId = shape.id() || shape.getParent()?.id()

      if (elementId) {
        const node = shape.getParent()?.className === 'Group' ? shape.getParent() : shape
        selectElement(elementId, node, shiftKey)
        return true
      }
    } else if (!shiftKey) {
      deselect()
    }

    return false
  }

  /**
   * Start rubber-band selection
   */
  function startRubberBand(x: number, y: number) {
    isRubberBanding.value = true
    rubberBandStart.value = { x, y }
    selectionRect.value = { x, y, width: 0, height: 0 }
  }

  /**
   * Update rubber-band selection rect
   */
  function updateRubberBand(x: number, y: number) {
    if (!isRubberBanding.value || !rubberBandStart.value) return
    const start = rubberBandStart.value
    selectionRect.value = {
      x: Math.min(start.x, x),
      y: Math.min(start.y, y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    }
  }

  /**
   * Complete rubber-band selection
   */
  function endRubberBand() {
    if (!isRubberBanding.value || !selectionRect.value) {
      isRubberBanding.value = false
      return
    }

    const rect = selectionRect.value
    if (rect.width < 5 && rect.height < 5) {
      // Too small — treat as click, not drag
      isRubberBanding.value = false
      selectionRect.value = null
      rubberBandStart.value = null
      return
    }

    // Find all elements that intersect the selection rectangle
    const stage = stageRef.value?.getNode()
    if (stage) {
      stage.find('Shape').forEach((shape: any) => {
        const parent = shape.getParent()
        const layer = parent?.getParent()
        const layerName = layer?.name()
        if (layerName === 'documentLayer' || layerName === 'transformerLayer') return

        const box = shape.getClientRect()
        if (box && box.x !== undefined) {
          const overlap = !(box.x > rect.x + rect.width ||
            box.x + box.width < rect.x ||
            box.y > rect.y + rect.height ||
            box.y + box.height < rect.y)
          if (overlap) {
            const elementId = shape.id() || parent?.id()
            if (elementId) {
              const node = parent?.className === 'Group' ? parent : shape
              node.draggable(true)
              selectedIds.value.add(elementId)
            }
          }
        }
      })

      selectedId.value = selectedIds.value.size > 0 ? Array.from(selectedIds.value)[0]! : null
      updateTransformer()
    }

    isRubberBanding.value = false
    selectionRect.value = null
    rubberBandStart.value = null
  }

  /**
   * Handle stage click for deselection
   */
  function handleStageClick(e: any) {
    if (e.target === e.target.getStage()) {
      deselect()
    }
  }

  // Auto-deselect when element is removed from elements array
  watch(elements, (newElements) => {
    const removed = Array.from(selectedIds.value).filter(id => !newElements.find(el => el.id === id))
    if (removed.length > 0) {
      for (const id of removed) {
        selectedIds.value.delete(id)
        if (selectedId.value === id) {
          selectedId.value = selectedIds.value.size > 0 ? Array.from(selectedIds.value)[0]! : null
        }
      }
      if (selectedIds.value.size === 0) deselect()
      else updateTransformer()
    }
  })

  return {
    // State
    selectedId,
    selectedElement,
    hasSelection,
    transformerRef,
    selectedIds,
    selectionRect,
    isRubberBanding,

    // Actions
    selectElement,
    deselect,
    deleteSelected,
    selectElementAtPosition,
    handleStageClick,
    startRubberBand,
    updateRubberBand,
    endRubberBand,
    updateTransformer,
  }
}
