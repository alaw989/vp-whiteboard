import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useViewport, getViewportBounds, computePinchViewport } from './useViewport'
import type { ViewportState } from '~/types'

describe('computePinchViewport', () => {
  it('pans by the centroid delta when finger distance is unchanged', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 50,
      currentCenter: { x: 150, y: 120 },
      currentDistance: 50,
    })
    expect(result).toEqual({ x: 50, y: 20, zoom: 1 })
  })

  it('pinches toward the centroid when the fingers spread apart', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 50,
      currentCenter: { x: 100, y: 100 },
      currentDistance: 100,
    })
    // Content under the fixed centroid stays under it: viewport must move to
    // compensate for the doubled zoom.
    expect(result.zoom).toBe(2)
    expect(result.x).toBeCloseTo(-100)
    expect(result.y).toBeCloseTo(-100)
  })

  it('anchors the content under the centroid from a panned/zoomed start', () => {
    const result = computePinchViewport({
      startViewport: { x: 50, y: 30, zoom: 2 },
      startCenter: { x: 150, y: 70 },
      startDistance: 40,
      currentCenter: { x: 160, y: 80 },
      currentDistance: 60,
    })
    expect(result.zoom).toBeCloseTo(3)
    expect(result.x).toBeCloseTo(10)
    expect(result.y).toBeCloseTo(20)
  })

  it('clamps zoom to maxZoom', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 10,
      currentCenter: { x: 100, y: 100 },
      currentDistance: 1000,
      maxZoom: 4,
    })
    expect(result.zoom).toBe(4)
  })

  it('clamps zoom to minZoom when fingers pinch together', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 2 },
      startCenter: { x: 100, y: 100 },
      startDistance: 200,
      currentCenter: { x: 100, y: 100 },
      currentDistance: 10,
      minZoom: 0.5,
    })
    expect(result.zoom).toBe(0.5)
  })

  it('falls back to pan-only when the start distance is zero', () => {
    const result = computePinchViewport({
      startViewport: { x: 0, y: 0, zoom: 1 },
      startCenter: { x: 100, y: 100 },
      startDistance: 0,
      currentCenter: { x: 130, y: 140 },
      currentDistance: 0,
    })
    expect(result.zoom).toBe(1)
    expect(result.x).toBeCloseTo(30)
    expect(result.y).toBeCloseTo(40)
  })
})

describe('getViewportBounds', () => {
  it('returns canvas bounds with the default padding', () => {
    const bounds = getViewportBounds(800, 600, { x: 0, y: 0, zoom: 1 })
    expect(bounds).toEqual({ left: -100, top: -100, right: 900, bottom: 700 })
  })

  it('scales the visible area by zoom', () => {
    const bounds = getViewportBounds(800, 600, { x: 100, y: 50, zoom: 2 })
    expect(bounds).toEqual({ left: -150, top: -125, right: 450, bottom: 375 })
  })

  it('honors a custom padding', () => {
    const bounds = getViewportBounds(400, 300, { x: 0, y: 0, zoom: 1 }, 0)
    expect(bounds.left).toBeCloseTo(0)
    expect(bounds.top).toBeCloseTo(0)
    expect(bounds.right).toBe(400)
    expect(bounds.bottom).toBe(300)
  })
})

describe('useViewport', () => {
  let pointer: { x: number; y: number } | null

  function makeStage() {
    const state = { x: 0, y: 0, draggable: false }
    const handlers = new Map<string, () => void>()
    const container = {
      style: {
        props: new Map<string, string>(),
        setProperty(key: string, value: string) {
          this.props.set(key, value)
        },
        removeProperty(key: string) {
          this.props.delete(key)
        },
      },
    }
    return {
      node: {
        x: (v?: number) => (v === undefined ? state.x : (state.x = v)),
        y: (v?: number) => (v === undefined ? state.y : (state.y = v)),
        draggable: (v?: boolean) => (v === undefined ? state.draggable : (state.draggable = v)),
        getPointerPosition: () => pointer,
        on: (evt: string, cb: () => void) => handlers.set(evt, cb),
        off: (evt: string) => handlers.delete(evt),
        container: () => container,
      },
      state,
      handlers,
      container,
    }
  }

  function makeRefs() {
    const stage = makeStage()
    const stageRef = ref({ getNode: () => stage.node })
    const container = document.createElement('div')
    Object.defineProperty(container, 'offsetWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'offsetHeight', { value: 600, configurable: true })
    const containerRef = ref(container)
    return { stage, stageRef, containerRef }
  }

  beforeEach(() => {
    pointer = { x: 50, y: 60 }
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with identity viewport and derived state', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    expect(vp.viewport.value).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(vp.zoomPercent.value).toBe(100)
    expect(vp.canZoomIn.value).toBe(true)
    expect(vp.canZoomOut.value).toBe(true)
    expect(vp.isPanning.value).toBe(false)
    expect(vp.stageConfig.value).toEqual({ scaleX: 1, scaleY: 1, x: 0, y: 0 })
  })

  it('reflects custom min/max zoom bounds in canZoomIn/canZoomOut', () => {
    const { stageRef, containerRef } = makeRefs()
    const maxed = useViewport({ stageRef, containerRef, maxZoom: 1 })
    expect(maxed.canZoomIn.value).toBe(false)
    expect(maxed.canZoomOut.value).toBe(true)

    const { stageRef: s2, containerRef: c2 } = makeRefs()
    const mined = useViewport({ stageRef: s2, containerRef: c2, minZoom: 1 })
    expect(mined.canZoomIn.value).toBe(true)
    expect(mined.canZoomOut.value).toBe(false)
  })

  it('handleWheel zooms in toward the pointer when deltaY is negative', () => {
    const { stage, stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    const preventDefault = vi.fn()
    vp.handleWheel({ evt: { preventDefault, deltaY: -1 } })
    expect(preventDefault).toHaveBeenCalled()
    expect(vp.viewport.value.zoom).toBeCloseTo(1.1)
    expect(stage.state.x).toBe(0)
  })

  it('handleWheel zooms out toward the pointer when deltaY is positive', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef, onViewportChange: vi.fn() })
    vp.setViewport({ zoom: 2 })
    vp.handleWheel({ evt: { preventDefault: vi.fn(), deltaY: 1 } })
    expect(vp.viewport.value.zoom).toBeCloseTo(2 / 1.1)
    expect(vp.zoomPercent.value).toBe(182)
  })

  it('handleWheel adjusts x/y to keep the pointer-anchored content fixed', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.setViewportDirect({ x: 10, y: 20 })
    pointer = { x: 100, y: 100 }
    vp.handleWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } })
    // newPos = pointer - (pointer - oldPos) * (newScale / oldScale)
    expect(vp.viewport.value.x).toBeCloseTo(100 - 90 * 1.1)
    expect(vp.viewport.value.y).toBeCloseTo(100 - 80 * 1.1)
  })

  it('handleWheel does nothing when there is no stage node', () => {
    const { stageRef, containerRef } = makeRefs()
    const noStage = ref(null)
    const vp = useViewport({ stageRef: noStage, containerRef })
    vp.handleWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } })
    expect(vp.viewport.value.zoom).toBe(1)
  })

  it('handleWheel does nothing when the pointer position is null', () => {
    const { stageRef, containerRef } = makeRefs()
    pointer = null
    const vp = useViewport({ stageRef, containerRef })
    vp.handleWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } })
    expect(vp.viewport.value.zoom).toBe(1)
  })

  it('handleWheel clamps zoom to maxZoom', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.setViewportDirect({ zoom: 4.9 })
    vp.handleWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } })
    expect(vp.viewport.value.zoom).toBe(5)
  })

  it('handleWheel clamps zoom to minZoom', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef, minZoom: 0.2 })
    vp.setViewportDirect({ zoom: 0.21 })
    vp.handleWheel({ evt: { preventDefault: vi.fn(), deltaY: 1 } })
    expect(vp.viewport.value.zoom).toBe(0.2)
  })

  it('handleWheel notifies onViewportChange', () => {
    const { stageRef, containerRef } = makeRefs()
    const onViewportChange = vi.fn()
    const vp = useViewport({ stageRef, containerRef, onViewportChange })
    vp.handleWheel({ evt: { preventDefault: vi.fn(), deltaY: -1 } })
    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(onViewportChange.mock.calls[0]![0]).toEqual(vp.viewport.value)
  })

  it('enablePan sets draggable and grab cursor after nextTick', async () => {
    const { stage, stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.enablePan()
    expect(vp.isPanning.value).toBe(true)
    await nextTick()
    await nextTick()
    expect(stage.state.draggable).toBe(true)
    expect(stage.container.style.props.get('cursor')).toBe('grab')
  })

  it('enablePan is a no-op without a stage node', async () => {
    const { containerRef } = makeRefs()
    const noStage = ref(null)
    const vp = useViewport({ stageRef: noStage, containerRef })
    vp.enablePan()
    expect(vp.isPanning.value).toBe(false)
    await nextTick()
  })

  it('disablePan captures the stage position, disables dragging, and clears cursor', () => {
    const { stage, stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    stage.node.x(120)
    stage.node.y(80)
    stage.container.style.props.set('cursor', 'grab')
    stage.node.draggable(true)
    const onViewportChange = vi.fn()
    const sync = useViewport({ stageRef, containerRef, onViewportChange })
    sync.disablePan()
    expect(stage.state.draggable).toBe(false)
    expect(stage.container.style.props.has('cursor')).toBe(false)
    expect(sync.isPanning.value).toBe(false)
    expect(sync.viewport.value.x).toBe(120)
    expect(sync.viewport.value.y).toBe(80)
    expect(onViewportChange).toHaveBeenCalledTimes(1)
  })

  it('disablePan is a no-op without a stage node', () => {
    const { containerRef } = makeRefs()
    const noStage = ref(null)
    const vp = useViewport({ stageRef: noStage, containerRef })
    expect(() => vp.disablePan()).not.toThrow()
    expect(vp.isPanning.value).toBe(false)
  })

  it('startPan/stopPan delegate to enablePan/disablePan', async () => {
    const { stage, stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.startPan()
    expect(vp.isPanning.value).toBe(true)
    await nextTick()
    await nextTick()
    expect(stage.state.draggable).toBe(true)
    vp.stopPan()
    expect(vp.isPanning.value).toBe(false)
    expect(stage.state.draggable).toBe(false)
  })

  it('registers drag listeners while panning and updates viewport on dragmove', async () => {
    const { stage, stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.enablePan()
    await nextTick()
    await nextTick()
    expect(stage.handlers.has('dragmove')).toBe(true)
    expect(stage.handlers.has('dragstart')).toBe(true)
    expect(stage.handlers.has('dragend')).toBe(true)

    stage.node.x(200)
    stage.node.y(150)
    stage.handlers.get('dragmove')!()
    expect(vp.viewport.value.x).toBe(200)
    expect(vp.viewport.value.y).toBe(150)

    stage.handlers.get('dragstart')!()
    expect(stage.container.style.props.get('cursor')).toBe('grabbing')
    stage.handlers.get('dragend')!()
    expect(stage.container.style.props.get('cursor')).toBe('grab')
  })

  it('removes drag listeners when panning stops', async () => {
    const { stage, stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.enablePan()
    await nextTick()
    await nextTick()
    vp.disablePan()
    await nextTick()
    expect(stage.handlers.has('dragmove')).toBe(false)
    expect(stage.handlers.has('dragstart')).toBe(false)
    expect(stage.handlers.has('dragend')).toBe(false)
  })

  it('zoomIn zooms toward the viewport center', () => {
    const { stageRef, containerRef } = makeRefs()
    const onViewportChange = vi.fn()
    const vp = useViewport({ stageRef, containerRef, onViewportChange })
    vp.setViewportDirect({ x: 100, y: 50 })
    vp.zoomIn()
    expect(vp.viewport.value.zoom).toBeCloseTo(1.1)
    // centerX = 400, centerY = 300
    expect(vp.viewport.value.x).toBeCloseTo(400 - (400 - 100) * 1.1)
    expect(vp.viewport.value.y).toBeCloseTo(300 - (300 - 50) * 1.1)
    expect(onViewportChange).toHaveBeenCalledTimes(1)
  })

  it('zoomIn clamps to maxZoom and is a no-op at the cap', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.setViewportDirect({ zoom: 5 })
    vp.zoomIn()
    expect(vp.viewport.value.zoom).toBe(5)
  })

  it('zoomIn uses 0,0 center when the container is missing', () => {
    const { stageRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef: ref(null) })
    vp.setViewportDirect({ x: 100, y: 50 })
    vp.zoomIn()
    expect(vp.viewport.value.zoom).toBeCloseTo(1.1)
    expect(vp.viewport.value.x).toBeCloseTo(0 - (0 - 100) * 1.1)
    expect(vp.viewport.value.y).toBeCloseTo(0 - (0 - 50) * 1.1)
  })

  it('zoomOut zooms toward the viewport center and clamps to minZoom', () => {
    const { stageRef, containerRef } = makeRefs()
    const onViewportChange = vi.fn()
    const vp = useViewport({ stageRef, containerRef, onViewportChange, minZoom: 0.2 })
    vp.setViewportDirect({ zoom: 0.21 })
    vp.zoomOut()
    expect(vp.viewport.value.zoom).toBe(0.2)
    expect(onViewportChange).toHaveBeenCalledTimes(1)
  })

  it('zoomOut is a no-op at the minimum zoom', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.setViewportDirect({ zoom: 0.1 })
    vp.zoomOut()
    expect(vp.viewport.value.zoom).toBe(0.1)
  })

  it('resetZoom restores identity and notifies', () => {
    const { stageRef, containerRef } = makeRefs()
    const onViewportChange = vi.fn()
    const vp = useViewport({ stageRef, containerRef, onViewportChange })
    vp.setViewportDirect({ x: 123, y: -45, zoom: 3 })
    vp.resetZoom()
    expect(vp.viewport.value).toEqual({ x: 0, y: 0, zoom: 1 })
    expect(onViewportChange).toHaveBeenCalledTimes(1)
  })

  it('setViewport applies partial updates and clamps zoom', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.setViewport({ x: 10 })
    expect(vp.viewport.value).toEqual({ x: 10, y: 0, zoom: 1 })
    vp.setViewport({ y: 20 })
    expect(vp.viewport.value).toEqual({ x: 10, y: 20, zoom: 1 })
    vp.setViewport({ zoom: 999 })
    expect(vp.viewport.value.zoom).toBe(5)
    vp.setViewport({ zoom: 0.001 })
    expect(vp.viewport.value.zoom).toBe(0.1)
  })

  it('setViewport notifies onViewportChange', () => {
    const { stageRef, containerRef } = makeRefs()
    const onViewportChange = vi.fn()
    const vp = useViewport({ stageRef, containerRef, onViewportChange })
    vp.setViewport({ x: 5 })
    expect(onViewportChange).toHaveBeenCalledWith({ x: 5, y: 0, zoom: 1 })
  })

  it('setViewportDirect mutates without syncing or notifying', () => {
    const { stageRef, containerRef } = makeRefs()
    const onViewportChange = vi.fn()
    const syncViewport = vi.fn()
    const vp = useViewport({ stageRef, containerRef, onViewportChange, userId: 'u1', syncViewport })
    vp.setViewportDirect({ x: 7, y: 8, zoom: 2 })
    expect(vp.viewport.value).toEqual({ x: 7, y: 8, zoom: 2 })
    expect(onViewportChange).not.toHaveBeenCalled()
    expect(syncViewport).not.toHaveBeenCalled()
  })

  it('applyRemoteViewport replaces the viewport and clears the remote flag on next tick', async () => {
    const { stageRef, containerRef } = makeRefs()
    const syncViewport = vi.fn()
    const vp = useViewport({ stageRef, containerRef, userId: 'u1', syncViewport })
    vp.applyRemoteViewport({ x: 42, y: 43, zoom: 2.5 })
    expect(vp.viewport.value).toEqual({ x: 42, y: 43, zoom: 2.5 })
    await nextTick()
    // A change made after the remote apply is not suppressed anymore.
    vp.setViewport({ x: 99 })
    vi.advanceTimersByTime(200)
    expect(syncViewport).toHaveBeenCalledTimes(1)
  })

  it('does not sync without a userId', () => {
    const { stageRef, containerRef } = makeRefs()
    const syncViewport = vi.fn()
    const vp = useViewport({ stageRef, containerRef, syncViewport })
    vp.setViewport({ x: 10 })
    vi.advanceTimersByTime(200)
    expect(syncViewport).not.toHaveBeenCalled()
  })

  it('does not sync when only a userId is provided without a sync function', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef, userId: 'u1' })
    vp.setViewport({ x: 10 })
    vi.advanceTimersByTime(200)
    expect(vp.viewport.value.x).toBe(10)
  })

  it('syncs a debounced significant change and remembers the synced viewport', () => {
    const { stageRef, containerRef } = makeRefs()
    const syncViewport = vi.fn()
    const vp = useViewport({ stageRef, containerRef, userId: 'u1', syncViewport })
    vp.setViewport({ x: 10 })
    vi.advanceTimersByTime(200)
    expect(syncViewport).toHaveBeenCalledTimes(1)
    expect(syncViewport).toHaveBeenCalledWith({ x: 10, y: 0, zoom: 1 })
  })

  it('skips syncing when the change is below the 5px/0.01 zoom threshold', () => {
    const { stageRef, containerRef } = makeRefs()
    const syncViewport = vi.fn()
    const vp = useViewport({ stageRef, containerRef, userId: 'u1', syncViewport })
    vp.setViewport({ x: 100 })
    vi.advanceTimersByTime(200)
    expect(syncViewport).toHaveBeenCalledTimes(1)
    // Small movement within the threshold: no second sync.
    vp.setViewport({ x: 103 })
    vp.setViewport({ y: 2 })
    vi.advanceTimersByTime(200)
    expect(syncViewport).toHaveBeenCalledTimes(1)
  })

  it('syncs again after a significant change', () => {
    const { stageRef, containerRef } = makeRefs()
    const syncViewport = vi.fn()
    const vp = useViewport({ stageRef, containerRef, userId: 'u1', syncViewport })
    vp.setViewport({ x: 0 })
    vi.advanceTimersByTime(200)
    vp.setViewport({ x: 20 })
    vi.advanceTimersByTime(200)
    expect(syncViewport).toHaveBeenCalledTimes(2)
    expect(syncViewport).toHaveBeenLastCalledWith({ x: 20, y: 0, zoom: 1 })
  })

  it('debounces rapid changes into a single sync', () => {
    const { stageRef, containerRef } = makeRefs()
    const syncViewport = vi.fn()
    const vp = useViewport({ stageRef, containerRef, userId: 'u1', syncViewport })
    vp.setViewport({ x: 1 })
    vp.setViewport({ x: 2 })
    vp.setViewport({ x: 3 })
    vi.advanceTimersByTime(50)
    expect(syncViewport).toHaveBeenCalledTimes(0)
    vi.advanceTimersByTime(50)
    expect(syncViewport).toHaveBeenCalledTimes(1)
    expect(syncViewport).toHaveBeenCalledWith({ x: 3, y: 0, zoom: 1 })
  })

  it('getViewportBounds returned by the composable reflects current viewport state', () => {
    const { stageRef, containerRef } = makeRefs()
    const vp = useViewport({ stageRef, containerRef })
    vp.setViewportDirect({ x: 50, y: 25, zoom: 2 })
    const bounds = vp.getViewportBounds(800, 600, 100)
    expect(bounds).toEqual({ left: -125, top: -112.5, right: 475, bottom: 387.5 })
  })
})
