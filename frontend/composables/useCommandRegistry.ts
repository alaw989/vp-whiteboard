import type { DrawingTool } from '~/types'

export interface CommandDefinition {
  name: string
  aliases: string[]
  description: string
  action: (engine: CommandEngine) => void
  hasParams?: boolean
}

export interface CommandEngine {
  execute: (input: string) => void
  output: (message: string) => void
  prompt: (message: string) => void
  setActiveTool: (tool: DrawingTool) => void
  toggleGrid: () => void
  toggleGridSnap: () => void
  toggleOrtho: () => void
  toggleSnap: () => void
  togglePolarTracking?: () => void
  undo: () => void
  redo: () => void
  isWaitingForParam: Ref<boolean>
  pendingCommand: Ref<CommandDefinition | null>
  pendingPrompt: Ref<string>
}

export function useCommandRegistry() {
  const commands = new Map<string, CommandDefinition>()

  function register(cmd: CommandDefinition) {
    commands.set(cmd.name.toUpperCase(), cmd)
    for (const alias of cmd.aliases) {
      commands.set(alias.toUpperCase(), cmd)
    }
  }

  function get(input: string): CommandDefinition | undefined {
    return commands.get(input.toUpperCase())
  }

  function getAll(): CommandDefinition[] {
    const seen = new Set<string>()
    const result: CommandDefinition[] = []
    for (const cmd of commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name)
        result.push(cmd)
      }
    }
    return result
  }

  function getCompletions(partial: string): CommandDefinition[] {
    const upper = partial.toUpperCase()
    const seen = new Set<string>()
    const result: CommandDefinition[] = []
    for (const [key, cmd] of commands) {
      if (key.startsWith(upper) && !seen.has(cmd.name)) {
        seen.add(cmd.name)
        result.push(cmd)
      }
    }
    return result
  }

  return { register, get, getAll, getCompletions }
}
