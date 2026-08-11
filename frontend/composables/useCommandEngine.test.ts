import { describe, expect, it, vi } from 'vitest'
import { useCommandEngine } from './useCommandEngine'
import { useCommandRegistry, type CommandDefinition } from './useCommandRegistry'
import type { DrawingTool } from '~/types'

function makeOptions() {
  return {
    setActiveTool: vi.fn<(tool: DrawingTool) => void>(),
    toggleGrid: vi.fn(),
    toggleGridSnap: vi.fn(),
    toggleOrtho: vi.fn(),
    toggleSnap: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  }
}

describe('useCommandRegistry', () => {
  it('registers by name and all aliases, case-insensitive', () => {
    const { register, get } = useCommandRegistry()
    const cmd: CommandDefinition = {
      name: 'LINE',
      aliases: ['L', 'ln'],
      description: 'Line tool',
      action: () => {},
    }
    register(cmd)
    expect(get('LINE')).toBe(cmd)
    expect(get('line')).toBe(cmd)
    expect(get('l')).toBe(cmd)
    expect(get('LN')).toBe(cmd)
    expect(get('CIRCLE')).toBeUndefined()
  })

  it('getAll returns each command once regardless of alias count', () => {
    const { register, getAll } = useCommandRegistry()
    register({ name: 'LINE', aliases: ['L', 'ln'], description: '', action: () => {} })
    register({ name: 'CIRCLE', aliases: ['C'], description: '', action: () => {} })
    const all = getAll()
    expect(all.map(c => c.name)).toEqual(['LINE', 'CIRCLE'])
  })

  it('getCompletions matches command names and aliases by prefix', () => {
    const { register, getCompletions } = useCommandRegistry()
    register({ name: 'LINE', aliases: ['L'], description: '', action: () => {} })
    register({ name: 'LARROW', aliases: ['LA'], description: '', action: () => {} })
    register({ name: 'CIRCLE', aliases: ['C'], description: '', action: () => {} })
    const completions = getCompletions('la')
    expect(completions.map(c => c.name).sort()).toEqual(['LARROW'])
  })

  it('getCompletions dedupes when both name and alias match', () => {
    const { register, getCompletions } = useCommandRegistry()
    const cmd: CommandDefinition = { name: 'PEN', aliases: ['P'], description: '', action: () => {} }
    register(cmd)
    const completions = getCompletions('p')
    expect(completions).toEqual([cmd])
  })

  it('getCompletions returns empty for no matches', () => {
    const { getCompletions } = useCommandRegistry()
    expect(getCompletions('zzz')).toEqual([])
  })
})

describe('useCommandEngine', () => {
  it('executes a registered command by name and switches tool', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('LINE')
    expect(options.setActiveTool).toHaveBeenCalledWith('line')
    expect(engine.outputLines.value).toContain('LINE: Specify first point')
    expect(engine.outputLines.value).toContain('> LINE')
  })

  it('executes a command via a lowercase alias', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('l')
    expect(options.setActiveTool).toHaveBeenCalledWith('line')
  })

  it('executes undo/redo/toggle commands through the options callbacks', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('UNDO')
    expect(options.undo).toHaveBeenCalled()
    engine.execute('REDO')
    expect(options.redo).toHaveBeenCalled()
    engine.execute('GRID')
    expect(options.toggleGrid).toHaveBeenCalled()
    engine.execute('GRIDSNAP')
    expect(options.toggleGridSnap).toHaveBeenCalled()
    engine.execute('ORTHO')
    expect(options.toggleOrtho).toHaveBeenCalled()
    engine.execute('OSNAP')
    expect(options.toggleSnap).toHaveBeenCalled()
  })

  it('reports POLAR as unavailable when togglePolarTracking is not provided', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('POLAR')
    expect(engine.outputLines.value).toContain('POLAR: Not available')
  })

  it('calls togglePolarTracking when provided', () => {
    const options = makeOptions()
    const togglePolarTracking = vi.fn()
    const engine = useCommandEngine({ ...options, togglePolarTracking })
    engine.execute('POLAR')
    expect(togglePolarTracking).toHaveBeenCalled()
  })

  it('ignores empty and whitespace-only input', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('   ')
    expect(engine.history.value).toEqual([])
    expect(engine.outputLines.value).toEqual([])
  })

  it('reports unknown commands', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('BOGUS')
    expect(engine.outputLines.value).toContain('Unknown command: BOGUS')
  })

  it('applies a bare number as direct distance while drawing', () => {
    const options = makeOptions()
    const applyDirectDistance = vi.fn(() => true)
    const engine = useCommandEngine({ ...options, applyDirectDistance, isDrawing: () => true })
    engine.execute('42')
    expect(applyDirectDistance).toHaveBeenCalledWith(42)
    expect(engine.outputLines.value).toContain('Distance: 42 applied')
  })

  it('falls back to plain distance output when direct distance is not applied', () => {
    const options = makeOptions()
    const applyDirectDistance = vi.fn(() => false)
    const engine = useCommandEngine({ ...options, applyDirectDistance, isDrawing: () => true })
    engine.execute('42')
    expect(engine.outputLines.value).toContain('Distance: 42')
  })

  it('outputs distance for a bare number when not drawing', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('3.5')
    expect(engine.outputLines.value).toContain('Distance: 3.5')
  })

  it('sets the fillet radius when the fillet tool is active', () => {
    const options = makeOptions()
    const setFilletRadiusIfActive = vi.fn(() => true)
    const engine = useCommandEngine({ ...options, setFilletRadiusIfActive })
    engine.execute('12')
    expect(setFilletRadiusIfActive).toHaveBeenCalledWith(12)
    expect(engine.outputLines.value).toContain('FILLET radius set to 12')
  })

  it('passes parameter input to the pending command action', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    const action = vi.fn()
    engine.pendingCommand.value = {
      name: 'CUSTOM',
      aliases: [],
      description: '',
      action,
    }
    engine.isWaitingForParam.value = true
    engine.execute('hello')
    expect(action).toHaveBeenCalledTimes(1)
    const eng = action.mock.calls[0]![0]
    expect(eng.output).toBeTypeOf('function')
    expect(eng.execute).toBeTypeOf('function')
    expect(eng.prompt).toBeTypeOf('function')
    expect(eng.setActiveTool).toBeTypeOf('function')
    expect(eng.pendingPrompt).toBeDefined()
    expect(eng.isWaitingForParam).toBeDefined()
  })

  it('cancelPending clears the waiting-for-param state', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.pendingCommand.value = {
      name: 'CUSTOM',
      aliases: [],
      description: '',
      action: () => {},
    }
    engine.isWaitingForParam.value = true
    engine.pendingPrompt.value = 'Enter value:'
    engine.cancelPending()
    expect(engine.isWaitingForParam.value).toBe(false)
    expect(engine.pendingCommand.value).toBeNull()
    expect(engine.pendingPrompt.value).toBe('')
  })

  it('tracks executed commands in history', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('LINE')
    engine.execute('CIRCLE')
    expect(engine.history.value).toEqual(['LINE', 'CIRCLE'])
  })

  it('caps outputLines at the last 100 lines', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    for (let i = 0; i < 105; i++) {
      engine.output(`line ${i}`)
    }
    expect(engine.outputLines.value).toHaveLength(100)
    expect(engine.outputLines.value[0]).toBe('line 5')
    expect(engine.outputLines.value[99]).toBe('line 104')
  })

  it('getAll returns the full registered command set', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    const all = engine.getAll()
    expect(all.length).toBeGreaterThan(30)
    expect(all.some(c => c.name === 'LINE')).toBe(true)
    expect(all.some(c => c.name === 'REVCLOUD')).toBe(true)
  })

  it('getCompletions exposes registry completion matching', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    const completions = engine.getCompletions('di')
    expect(completions.length).toBeGreaterThan(0)
    expect(completions.map(c => c.name)).toContain('DIMENSION')
  })

  it('passes tool callbacks into every registered command action', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    engine.execute('CIRCLE')
    expect(options.setActiveTool).toHaveBeenCalledWith('circle')
    engine.execute('RECTANGLE')
    expect(options.setActiveTool).toHaveBeenCalledWith('rectangle')
    engine.execute('MIRROR')
    expect(options.setActiveTool).toHaveBeenCalledWith('mirror')
  })

  it('executes every registered command by name without throwing', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    const all = engine.getAll()
    expect(all.length).toBeGreaterThan(30)
    for (const cmd of all) {
      engine.execute(cmd.name)
    }
    expect(engine.history.value).toEqual(all.map(c => c.name))
  })

  it('executes every registered command by its aliases', () => {
    const options = makeOptions()
    const engine = useCommandEngine(options)
    const all = engine.getAll()
    for (const cmd of all) {
      for (const alias of cmd.aliases) {
        engine.execute(alias)
      }
    }
    // No unknown-command output means every alias resolved
    expect(engine.outputLines.value.some(l => l.startsWith('Unknown command'))).toBe(false)
  })
})
