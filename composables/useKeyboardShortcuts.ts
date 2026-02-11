import { onMounted, onUnmounted, type Ref } from 'vue'

export interface KeyboardShortcutOptions {
  canUndo: Ref<boolean> | (() => boolean)
  canRedo: Ref<boolean> | (() => boolean)
  onUndo: () => void
  onRedo: () => void
  onDelete?: () => void
  onEscape?: () => void
  toolShortcuts?: Record<string, string> // key -> tool name mapping
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions) {
  const {
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onDelete,
    onEscape,
    toolShortcuts,
  } = options

  // Helper to get boolean value from Ref or function
  function getCanUndo(): boolean {
    return typeof canUndo === 'function' ? canUndo() : canUndo.value
  }

  function getCanRedo(): boolean {
    return typeof canRedo === 'function' ? canRedo() : canRedo.value
  }

  function handleKeydown(event: KeyboardEvent) {
    // Check if user is typing in an input/textarea - don't trigger shortcuts
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true'
    ) {
      return
    }

    // Ctrl+Z or Cmd+Z for undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault()
      if (getCanUndo()) {
        onUndo()
      }
      return
    }

    // Ctrl+Y or Cmd+Y for redo
    if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
      event.preventDefault()
      if (getCanRedo()) {
        onRedo()
      }
      return
    }

    // Ctrl+Shift+Z or Cmd+Shift+Z for redo (alternative)
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z') {
      event.preventDefault()
      if (getCanRedo()) {
        onRedo()
      }
      return
    }

    // Escape key handler
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault()
      onEscape()
      return
    }

    // Delete or Backspace for delete (optional, if onDelete provided)
    if (onDelete && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault()
      onDelete()
      return
    }

    // Tool shortcuts (optional)
    if (toolShortcuts) {
      const key = event.key.toLowerCase()
      const tool = toolShortcuts[key]
      if (tool) {
        // Don't prevent default for tool shortcuts to allow browser behavior
        // The caller can handle the tool change
        const toolEvent = new CustomEvent('tool-shortcut', {
          detail: { tool },
          bubbles: true,
        })
        window.dispatchEvent(toolEvent)
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })

  return {
    handleKeydown,
  }
}
