import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { serializeDocumentLayers, mergeDocumentLayers } from '~/utils/canvasState'
import type { DocumentLayer } from '~/types'

describe('canvasState', () => {
  describe('serializeDocumentLayers', () => {
    it('returns empty array when map is empty', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const result = serializeDocumentLayers(yMap)

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })

    it('serializes a single layer to plain JSON (no Yjs refs)', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const layer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,test',
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      yMap.set('layer-1', layer)

      const result = serializeDocumentLayers(yMap)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(layer)
      // Verify it's plain JSON (no Yjs internals)
      expect(JSON.stringify(result)).toBe(JSON.stringify([layer]))
    })

    it('serializes multiple layers', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const layer1: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,test1',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 3,
      }

      const layer2: DocumentLayer = {
        id: 'layer-2',
        type: 'image',
        fileId: 'file-2',
        src: 'data:image/png;base64,test2',
        x: 100,
        y: 100,
        width: 400,
        height: 300,
        scale: 1.5,
        opacity: 0.8,
        visible: true,
      }

      yMap.set('layer-1', layer1)
      yMap.set('layer-2', layer2)

      const result = serializeDocumentLayers(yMap)

      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe('layer-1')
      expect(result[1]?.id).toBe('layer-2')
    })

    it('survives JSON.parse(JSON.stringify()) round-trip', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const layer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,test',
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      yMap.set('layer-1', layer)
      const serialized = serializeDocumentLayers(yMap)

      // JSON round-trip
      const jsonStr = JSON.stringify(serialized)
      const parsed = JSON.parse(jsonStr) as DocumentLayer[]

      expect(parsed).toEqual(serialized)
      expect(parsed[0]?.id).toBe('layer-1')
      expect(parsed[0]?.src).toBe('data:application/pdf;base64,test')
    })
  })

  describe('mergeDocumentLayers', () => {
    it('merges a single layer into empty map', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const layer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,test',
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      mergeDocumentLayers(yMap, [layer])

      expect(yMap.size).toBe(1)
      expect(yMap.get('layer-1')).toEqual(layer)
    })

    it('merges multiple layers', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const layers: DocumentLayer[] = [
        {
          id: 'layer-1',
          type: 'pdf',
          fileId: 'file-1',
          src: 'data:application/pdf;base64,test1',
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          scale: 1,
          opacity: 1,
          visible: true,
          pageNumber: 1,
          totalPages: 3,
        },
        {
          id: 'layer-2',
          type: 'image',
          fileId: 'file-2',
          src: 'data:image/png;base64,test2',
          x: 100,
          y: 100,
          width: 400,
          height: 300,
          scale: 1.5,
          opacity: 0.8,
          visible: true,
        },
      ]

      mergeDocumentLayers(yMap, layers)

      expect(yMap.size).toBe(2)
      expect(yMap.get('layer-1')).toEqual(layers[0])
      expect(yMap.get('layer-2')).toEqual(layers[1])
    })

    it('is idempotent: re-running creates no duplicates', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const layer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,test',
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      // First merge
      mergeDocumentLayers(yMap, [layer])
      expect(yMap.size).toBe(1)

      // Second merge with same data
      mergeDocumentLayers(yMap, [layer])
      expect(yMap.size).toBe(1) // Still only 1 layer, no duplicate

      // Verify the layer still exists
      const merged = yMap.get('layer-1')
      expect(merged).toBeDefined()
      expect(merged).toEqual(layer)
    })

    it('does not replace existing layer with same id (preserves live sync)', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const originalLayer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,original',
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      const updatedLayer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,updated',
        x: 150, // Different position
        y: 250,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      // Set up the original layer (simulating live sync state)
      yMap.set('layer-1', originalLayer)
      const beforeMerge = yMap.get('layer-1')
      expect(beforeMerge).toEqual(originalLayer)

      // Attempt to merge updated layer
      mergeDocumentLayers(yMap, [updatedLayer])

      // Original should still be there (not replaced)
      expect(yMap.size).toBe(1)
      const afterMerge = yMap.get('layer-1')
      expect(afterMerge).toEqual(originalLayer)
      expect(afterMerge).not.toEqual(updatedLayer)
    })

    it('handles empty layers array (no-op)', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      mergeDocumentLayers(yMap, [])

      expect(yMap.size).toBe(0)
    })
  })

  describe('round-trip serialize → merge', () => {
    it('layers survive the round-trip with same ids and data', () => {
      const ydoc1 = new Y.Doc()
      const yMap1 = ydoc1.getMap('documentLayers')

      const originalLayers: DocumentLayer[] = [
        {
          id: 'layer-1',
          type: 'pdf',
          fileId: 'file-1',
          src: 'data:application/pdf;base64,pdf1',
          x: 10,
          y: 20,
          width: 500,
          height: 400,
          scale: 1,
          opacity: 1,
          visible: true,
          pageNumber: 2,
          totalPages: 10,
        },
        {
          id: 'layer-2',
          type: 'image',
          fileId: 'file-2',
          src: 'data:image/jpeg;base64,img2',
          x: 300,
          y: 150,
          width: 200,
          height: 150,
          scale: 0.8,
          opacity: 0.9,
          visible: false,
        },
      ]

      // Populate first map
      for (const layer of originalLayers) {
        yMap1.set(layer.id, layer)
      }

      // Serialize
      const serialized = serializeDocumentLayers(yMap1)

      // Merge into fresh map
      const ydoc2 = new Y.Doc()
      const yMap2 = ydoc2.getMap('documentLayers')
      mergeDocumentLayers(yMap2, serialized)

      // Verify both layers survived with same data
      expect(yMap2.size).toBe(2)
      expect(yMap2.get('layer-1')).toEqual(originalLayers[0])
      expect(yMap2.get('layer-2')).toEqual(originalLayers[1])
    })

    it('round-trip output is JSON-stable', () => {
      const ydoc1 = new Y.Doc()
      const yMap1 = ydoc1.getMap('documentLayers')

      const layer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,test',
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      yMap1.set('layer-1', layer)
      const serialized = serializeDocumentLayers(yMap1)

      // JSON round-trip
      const jsonStr = JSON.stringify(serialized)
      const parsed = JSON.parse(jsonStr) as DocumentLayer[]

      // Merge parsed data into fresh map
      const ydoc2 = new Y.Doc()
      const yMap2 = ydoc2.getMap('documentLayers')
      mergeDocumentLayers(yMap2, parsed)

      // Verify it survived
      expect(yMap2.size).toBe(1)
      expect(yMap2.get('layer-1')).toEqual(layer)
    })

    it('re-importing state with existing layer ids creates no duplicates', () => {
      const ydoc = new Y.Doc()
      const yMap = ydoc.getMap('documentLayers')

      const layer: DocumentLayer = {
        id: 'layer-1',
        type: 'pdf',
        fileId: 'file-1',
        src: 'data:application/pdf;base64,test',
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        scale: 1,
        opacity: 1,
        visible: true,
        pageNumber: 1,
        totalPages: 5,
      }

      // Initial import
      mergeDocumentLayers(yMap, [layer])
      expect(yMap.size).toBe(1)

      // Simulate a "live sync" arrival of the same layer
      yMap.set('layer-synced', { id: 'layer-synced', type: 'image', fileId: 'f2', src: 'data:,x', x: 0, y: 0, width: 100, height: 100, scale: 1, opacity: 1, visible: true })
      expect(yMap.size).toBe(2)

      // Re-import the same state (should not create duplicates)
      mergeDocumentLayers(yMap, [layer])
      expect(yMap.size).toBe(2) // Still 2, not 3
    })
  })
})
