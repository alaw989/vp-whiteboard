import { ref, computed, watch, type Ref } from 'vue'
import type { CanvasElement } from '~/types'

export function useSelection(stageRef: Ref<any>, elements: Ref<CanvasElement[]>) {
  // Selection state
  const selectedId = ref<string | null>(null)
  const transformerRef = ref<any>(null)

  // Get the selected element
  const selectedElement = computed(() =>
    elements.value.find(el => el.id === selectedId.value)
  )

  // Check if an element is currently selected
  const hasSelection = computed(() => selectedId.value !== null)

  /**
   * Select an element and attach transformer to its node
   */
  function selectElement(id: string, node: any) {
    selectedId.value = id

    const transformer = transformerRef.value?.getNode()
    const stage = stageRef.value?.getNode()

    if (transformer && stage && node) {
      // Attach transformer to the selected node
      transformer.nodes([node])

      // Move transformer to top of layer
      transformer.moveToTop()

      // Enable dragging on the element
      node.draggable(true)
    }
  }

  /**
   * Deselect current element
   */
  function deselect() {
    const transformer = transformerRef.value?.getNode()
    const stage = stageRef.value?.getNode()

    if (transformer) {
      // Detach transformer from all nodes
      transformer.nodes([])

      // Disable dragging on all elements
      stage?.find('Shape').forEach((shape: any) => {
        shape.draggable(false)
      })

      // Also disable dragging on groups (for stamps, text-annotations)
      stage?.find('Group').forEach((group: any) => {
        group.draggable(false)
      })
    }

    selectedId.value = null
  }

  /**
   * Delete the selected element
   * Returns the element ID for deletion
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
  function selectElementAtPosition(x: number, y: number): boolean {
    const stage = stageRef.value?.getNode()
    if (!stage) return false

    // Get all shapes at the clicked position (reverse for top-most first)
    const shapes = stage.getAllIntersections({ x, y }).reverse()

    // Filter out document layer and background
    const canvasShapes = shapes.filter((shape: any) => {
      const parent = shape.getParent()
      const layer = parent?.getParent()
      const layerName = layer?.name()
      return layerName !== 'documentLayer' && layerName !== 'transformerLayer'
    })

    if (canvasShapes.length > 0) {
      // Get the first shape's associated element ID
      const shape = canvasShapes[0]

      // For groups (stamps, text-annotations), get the group's id
      // For individual shapes, get the shape's id
      const elementId = shape.id() || shape.getParent()?.id()

      if (elementId) {
        // Find the actual node to attach transformer to
        // For groups, attach to the group, for shapes attach to the shape
        const node = shape.getParent()?.className === 'Group' ? shape.getParent() : shape
        selectElement(elementId, node)
        return true
      }
    }

    // No element found - deselect
    deselect()
    return false
  }

  /**
   * Handle stage click for deselection
   */
  function handleStageClick(e: any) {
    // Clicked on empty stage - deselect
    if (e.target === e.target.getStage()) {
      deselect()
    }
  }

  // Auto-deselect when element is removed from elements array
  watch(elements, (newElements) => {
    if (selectedId.value && !newElements.find(el => el.id === selectedId.value)) {
      deselect()
    }
  })

  return {
    // State
    selectedId,
    selectedElement,
    hasSelection,
    transformerRef,

    // Actions
    selectElement,
    deselect,
    deleteSelected,
    selectElementAtPosition,
    handleStageClick,
  }
}
