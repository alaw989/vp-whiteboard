import { describe, expect, it, vi } from 'vitest'
import { usePanTool } from './usePanTool'
import { createMockToolContext } from './__tests__/mockToolContext'

describe('usePanTool', () => {
  it('onMouseDown enables pan', () => {
    const ctx = createMockToolContext()
    const handler = usePanTool(ctx)

    handler.onMouseDown?.({}, { x: 100, y: 200 })

    expect(ctx.isDrawing.value).toBe(true)
  })

  it('onMouseUp disables pan', () => {
    const ctx = createMockToolContext()
    const handler = usePanTool(ctx)

    ctx.isDrawing.value = true
    handler.onMouseUp?.({}, { x: 100, y: 200 })

    expect(ctx.isDrawing.value).toBe(false)
  })

  it('activate sets cursor to grab', () => {
    const ctx = createMockToolContext()
    const handler = usePanTool(ctx)

    handler.activate?.()

    expect(ctx.setCursor).toHaveBeenCalledWith('grab')
  })

  it('deactivate clears cursor and disables pan', () => {
    const ctx = createMockToolContext()
    const handler = usePanTool(ctx)

    handler.deactivate?.()

    expect(ctx.clearCursor).toHaveBeenCalled()
    expect(ctx.panStartPointer.value).toBeNull()
    expect(ctx.panStartViewport.value).toBeNull()
  })
})
