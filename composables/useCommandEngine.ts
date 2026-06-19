import { useCommandRegistry, type CommandDefinition } from './useCommandRegistry'
import type { DrawingTool } from '~/types'

export interface CommandEngineOptions {
  setActiveTool: (tool: DrawingTool) => void
  toggleGrid: () => void
  toggleGridSnap: () => void
  toggleOrtho: () => void
  toggleSnap: () => void
  togglePolarTracking?: () => void
  applyDirectDistance?: (distance: number) => boolean
  isDrawing?: () => boolean
  setFilletRadiusIfActive?: (n: number) => boolean
  undo: () => void
  redo: () => void
}

export function useCommandEngine(options: CommandEngineOptions) {
  const { register, get, getAll, getCompletions } = useCommandRegistry()

  const history = ref<string[]>([])
  const outputLines = ref<string[]>([])
  const isWaitingForParam = ref(false)
  const pendingCommand = ref<CommandDefinition | null>(null)
  const pendingPrompt = ref('')
  const currentInput = ref('')

  function output(message: string) {
    outputLines.value.push(message)
    if (outputLines.value.length > 100) {
      outputLines.value = outputLines.value.slice(-100)
    }
  }

  function prompt(message: string) {
    isWaitingForParam.value = true
    pendingPrompt.value = message
    output(message)
  }

  function execute(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return

    history.value.push(trimmed)
    output(`> ${trimmed}`)

    // If waiting for a parameter
    if (isWaitingForParam.value && pendingCommand.value) {
      // Pass the input as a parameter to the pending command
      pendingCommand.value.action({ execute, output, prompt, setActiveTool: options.setActiveTool, toggleGrid: options.toggleGrid, toggleGridSnap: options.toggleGridSnap, toggleOrtho: options.toggleOrtho, toggleSnap: options.toggleSnap, togglePolarTracking: options.togglePolarTracking, undo: options.undo, redo: options.redo, isWaitingForParam, pendingCommand, pendingPrompt })
      return
    }

    // Try to find a command
    const cmd = get(trimmed)
    if (cmd) {
      cmd.action({ execute, output, prompt, setActiveTool: options.setActiveTool, toggleGrid: options.toggleGrid, toggleGridSnap: options.toggleGridSnap, toggleOrtho: options.toggleOrtho, toggleSnap: options.toggleSnap, undo: options.undo, redo: options.redo, isWaitingForParam, pendingCommand, pendingPrompt })
      return
    }

    // Try as a numeric value (direct distance entry)
    const num = parseFloat(trimmed)
    if (!isNaN(num)) {
      if (options.isDrawing?.() && options.applyDirectDistance) {
        const success = options.applyDirectDistance(num)
        if (success) {
          output(`Distance: ${num} applied`)
          return
        }
      }
      // Bare number while the fillet tool is active sets the fillet radius.
      if (options.setFilletRadiusIfActive?.(num)) {
        output(`FILLET radius set to ${num}`)
        return
      }
      output(`Distance: ${num}`)
      return
    }

    output(`Unknown command: ${trimmed}`)
  }

  function cancelPending() {
    isWaitingForParam.value = false
    pendingCommand.value = null
    pendingPrompt.value = ''
  }

  // Register all commands per spec
  register({ name: 'LINE', aliases: ['L'], description: 'Line tool', action: (eng) => { eng.setActiveTool('line'); eng.output('LINE: Specify first point') } })
  register({ name: 'CIRCLE', aliases: ['C'], description: 'Circle tool', action: (eng) => { eng.setActiveTool('circle'); eng.output('CIRCLE: Specify center point') } })
  register({ name: 'RECTANGLE', aliases: ['REC'], description: 'Rectangle tool', action: (eng) => { eng.setActiveTool('rectangle'); eng.output('RECTANGLE: Specify first corner') } })
  register({ name: 'ELLIPSE', aliases: ['EL'], description: 'Ellipse tool', action: (eng) => { eng.setActiveTool('ellipse'); eng.output('ELLIPSE: Specify axis endpoint') } })
  register({ name: 'ARROW', aliases: ['A'], description: 'Arrow tool', action: (eng) => { eng.setActiveTool('arrow'); eng.output('ARROW: Specify start point') } })
  register({ name: 'TEXT', aliases: ['T', 'DT'], description: 'Text annotation', action: (eng) => { eng.setActiveTool('text-annotation'); eng.output('TEXT: Specify annotation start point') } })
  register({ name: 'PEN', aliases: ['P', 'SKETCH'], description: 'Pen tool', action: (eng) => { eng.setActiveTool('pen'); eng.output('PEN: Start drawing') } })
  register({ name: 'SELECT', aliases: ['V', 'SEL'], description: 'Select tool', action: (eng) => { eng.setActiveTool('select'); eng.output('SELECT: Click to select') } })
  register({ name: 'PAN', aliases: ['H', 'HAND'], description: 'Pan tool', action: (eng) => { eng.setActiveTool('pan'); eng.output('PAN: Click and drag to pan') } })
  register({ name: 'ERASE', aliases: ['X', 'ER'], description: 'Eraser tool', action: (eng) => { eng.setActiveTool('eraser'); eng.output('ERASE: Click on elements to erase') } })
  register({ name: 'MEASURE', aliases: ['M', 'DIST'], description: 'Measure distance', action: (eng) => { eng.setActiveTool('measure-distance'); eng.output('MEASURE: Specify first point') } })
  register({ name: 'STAMP', aliases: ['S'], description: 'Stamp tool', action: (eng) => { eng.setActiveTool('stamp'); eng.output('STAMP: Click to place stamp') } })
  register({ name: 'HIGHLIGHTER', aliases: ['B', 'HL'], description: 'Highlighter tool', action: (eng) => { eng.setActiveTool('highlighter'); eng.output('HIGHLIGHTER: Start drawing') } })
  register({ name: 'UNDO', aliases: ['U'], description: 'Undo', action: (eng) => { eng.undo(); eng.output('UNDO') } })
  register({ name: 'REDO', aliases: ['RE'], description: 'Redo', action: (eng) => { eng.redo(); eng.output('REDO') } })
  register({ name: 'GRID', aliases: ['G'], description: 'Toggle grid', action: (eng) => { eng.toggleGrid(); eng.output('GRID toggled') } })
  register({ name: 'GRIDSNAP', aliases: ['GS', 'SNAP'], description: 'Toggle grid snap', action: (eng) => { eng.toggleGridSnap(); eng.output('GRID SNAP toggled') } })
  register({ name: 'ORTHO', aliases: [], description: 'Toggle ortho mode (F8)', action: (eng) => { eng.toggleOrtho(); eng.output('ORTHO toggled') } })
  register({ name: 'OSNAP', aliases: ['OS'], description: 'Toggle object snaps', action: (eng) => { eng.toggleSnap(); eng.output('OSNAP toggled') } })
  register({ name: 'POLAR', aliases: ['POL'], description: 'Toggle polar tracking', action: (eng) => { if (eng.togglePolarTracking) { eng.togglePolarTracking() } else { eng.output('POLAR: Not available') } } })

  // Modification tools
  register({ name: 'OFFSET', aliases: ['OFF'], description: 'Offset tool — click near element to create parallel copy', action: (eng) => { eng.setActiveTool('offset'); eng.output('OFFSET: Click near an element to set distance, then click to place offset copy') } })
  register({ name: 'TRIM', aliases: ['TR'], description: 'Trim tool — select cutting edge then trim element', action: (eng) => { eng.setActiveTool('trim'); eng.output('TRIM: Select cutting edge, then click element to trim') } })
  register({ name: 'EXTEND', aliases: ['EX'], description: 'Extend tool — select boundary then extend element', action: (eng) => { eng.setActiveTool('extend'); eng.output('EXTEND: Select boundary edge, then click element to extend') } })
  register({ name: 'FILLET', aliases: ['F'], description: 'Fillet tool — select two lines to create rounded corner', action: (eng) => { eng.setActiveTool('fillet'); eng.output('FILLET: Select first line, then second line to create fillet') } })
  register({ name: 'MIRROR', aliases: ['MI'], description: 'Mirror tool — select elements then specify mirror axis', action: (eng) => { eng.setActiveTool('mirror'); eng.output('MIRROR: Click elements to select (Enter to confirm), then click two points for mirror axis') } })
  register({ name: 'ROTATE', aliases: ['RO'], description: 'Rotate tool — select elements, set a base point, then drag to rotate', action: (eng) => { eng.setActiveTool('rotate'); eng.output('ROTATE: Click elements to select (Enter to confirm), click base point, then move and click to set rotation angle') } })
  register({ name: 'SCALE', aliases: ['SC'], description: 'Scale tool — select elements, set a base point, then drag to scale', action: (eng) => { eng.setActiveTool('scale'); eng.output('SCALE: Click elements to select (Enter to confirm), click base point, then move and click to set scale factor') } })
  register({ name: 'POLYLINE', aliases: ['PL'], description: 'Polyline tool', action: (eng) => { eng.setActiveTool('polyline'); eng.output('POLYLINE: Click to add vertices, Enter/double-click to finish, Esc to cancel, C to close') } })
  register({ name: 'ARC', aliases: ['ARC'], description: 'Arc tool', action: (eng) => { eng.setActiveTool('arc'); eng.output('ARC: Click start point, through point, then end point') } })
  register({ name: 'REVCLOUD', aliases: ['RC', 'REVC'], description: 'Revision cloud tool — click vertices, Enter to close the cloud', action: (eng) => { eng.setActiveTool('revision-cloud'); eng.output('REVCLOUD: Click to add vertices, Enter/double-click to close cloud, Backspace to undo, Esc to cancel') } })
  register({ name: 'DIMENSION', aliases: ['DIM', 'DI'], description: 'Dimension tool — click two points, drag to set offset', action: (eng) => { eng.setActiveTool('dimension'); eng.output('DIMENSION: Click first point, second point, then drag to set offset and click to place') } })
  register({ name: 'LAYER', aliases: ['LA'], description: 'Toggle layer panel', action: (eng) => { eng.output('LAYER: Use the layer panel in the toolbar to manage layers') } })

  return {
    history: readonly(history),
    outputLines: readonly(outputLines),
    isWaitingForParam,
    pendingCommand,
    pendingPrompt,
    currentInput,
    execute,
    cancelPending,
    getCompletions,
    getAll,
    output,
  }
}
