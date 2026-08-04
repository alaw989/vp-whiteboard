import { describe, expect, it, vi } from 'vitest'
import { useToolHandlers } from '~/composables/useToolHandlers'

describe('useToolHandlers', () => {
  it('register and get round-trip a handler', () => {
    const { register, get } = useToolHandlers()
    const h = { onMouseDown: vi.fn() }
    register('select', h)
    expect(get('select')).toBe(h)
  })

  it('dispatchMouseDown calls onMouseDown with correct args', () => {
    const { register, dispatchMouseDown } = useToolHandlers()
    const fn = vi.fn()
    register('line', { onMouseDown: fn })
    dispatchMouseDown('line', { a: 1 }, { x: 10, y: 20 })
    expect(fn).toHaveBeenCalledWith({ a: 1 }, { x: 10, y: 20 })
  })

  it('dispatchMouseMove calls onMouseMove', () => {
    const { register, dispatchMouseMove } = useToolHandlers()
    const fn = vi.fn()
    register('line', { onMouseMove: fn })
    dispatchMouseMove('line', {}, { x: 5, y: 5 })
    expect(fn).toHaveBeenCalled()
  })

  it('dispatchMouseUp calls onMouseUp', () => {
    const { register, dispatchMouseUp } = useToolHandlers()
    const fn = vi.fn()
    register('line', { onMouseUp: fn })
    dispatchMouseUp('line', {}, { x: 0, y: 0 })
    expect(fn).toHaveBeenCalled()
  })

  it('dispatchKeyDown returns true when onKeyDown returns true', () => {
    const { register, dispatchKeyDown } = useToolHandlers()
    register('select', { onKeyDown: () => true })
    expect(dispatchKeyDown('select', new KeyboardEvent('keydown'))).toBe(true)
  })

  it('dispatchKeyDown returns false when handler has no onKeyDown', () => {
    const { register, dispatchKeyDown } = useToolHandlers()
    register('select', {})
    expect(dispatchKeyDown('select', new KeyboardEvent('keydown'))).toBe(false)
  })

  it('dispatchKeyDown returns false when onKeyDown returns void', () => {
    const { register, dispatchKeyDown } = useToolHandlers()
    register('select', { onKeyDown: () => {} })
    expect(dispatchKeyDown('select', new KeyboardEvent('keydown'))).toBe(false)
  })

  it('activateTool calls activate', () => {
    const { register, activateTool } = useToolHandlers()
    const fn = vi.fn()
    register('pen', { activate: fn })
    activateTool('pen')
    expect(fn).toHaveBeenCalled()
  })

  it('deactivateTool calls deactivate', () => {
    const { register, deactivateTool } = useToolHandlers()
    const fn = vi.fn()
    register('pen', { deactivate: fn })
    deactivateTool('pen')
    expect(fn).toHaveBeenCalled()
  })

  it('wrapError catches errors and logs via console.error', () => {
    const { register, dispatchMouseDown } = useToolHandlers()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    register('line', { onMouseDown: () => { throw new Error('fail') } })
    dispatchMouseDown('line', {}, { x: 0, y: 0 })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('dispatch methods silently handle missing handlers', () => {
    const { dispatchMouseDown, dispatchMouseMove, dispatchMouseUp } = useToolHandlers()
    expect(() => {
      dispatchMouseDown('x' as any, {}, { x: 0, y: 0 })
      dispatchMouseMove('x' as any, {}, { x: 0, y: 0 })
      dispatchMouseUp('x' as any, {}, { x: 0, y: 0 })
    }).not.toThrow()
  })

  it('handler method is optional', () => {
    const { register, dispatchMouseUp } = useToolHandlers()
    register('line', { onMouseDown: vi.fn() })
    expect(() => dispatchMouseUp('line', {}, { x: 0, y: 0 })).not.toThrow()
  })
})
