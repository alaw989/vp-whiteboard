import type { DocumentLayer } from '~/types'
import type * as Y from 'yjs'

/**
 * Serialize document layers from a Yjs Map to a plain JSON-serializable array.
 * This extracts the layers from the live CRDT state for persistence.
 *
 * @param yMap - The Yjs Map containing document layers (yDocumentLayers)
 * @returns Array of DocumentLayer objects (plain JSON, no Yjs internals)
 */
export function serializeDocumentLayers(yMap: Y.Map<any>): DocumentLayer[] {
  const layers: DocumentLayer[] = []
  for (const [id, layer] of yMap.entries()) {
    // Deep copy to avoid Yjs refs leaking into the serialized state
    layers.push(JSON.parse(JSON.stringify(layer)))
  }
  return layers
}

/**
 * Merge document layers into a Yjs Map, avoiding duplicates by id.
 * This restores persisted layers into the live CRDT state.
 *
 * Idempotent: if a layer with the same id already exists in the target map,
 * it is NOT replaced (preserves live sync over stale persisted state).
 *
 * @param yMap - The Yjs Map to merge into (yDocumentLayers)
 * @param layers - Array of DocumentLayer objects to merge
 */
export function mergeDocumentLayers(yMap: Y.Map<any>, layers: DocumentLayer[]): void {
  for (const layer of layers) {
    // Only insert if the layer doesn't already exist (by id)
    // This prevents conflicts with layers arriving via real-time sync
    if (!yMap.has(layer.id)) {
      // Deep copy to ensure we're not holding references to the input
      yMap.set(layer.id, JSON.parse(JSON.stringify(layer)))
    }
  }
}
