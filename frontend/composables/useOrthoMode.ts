export interface OrthoModeOptions {
  enabled?: boolean
}

export function useOrthoMode(options: OrthoModeOptions = {}) {
  const isOrthoEnabled = ref(options.enabled ?? false)

  function toggle() {
    isOrthoEnabled.value = !isOrthoEnabled.value
  }

  function enable() {
    isOrthoEnabled.value = true
  }

  function disable() {
    isOrthoEnabled.value = false
  }

  /**
   * Constrain a point to horizontal or vertical axis relative to origin.
   * Snaps to whichever axis has the larger delta.
   */
  function constrainPoint(origin: { x: number; y: number }, cursor: { x: number; y: number }): { x: number; y: number } {
    if (!isOrthoEnabled.value) return cursor

    const dx = Math.abs(cursor.x - origin.x)
    const dy = Math.abs(cursor.y - origin.y)

    if (dx >= dy) {
      return { x: cursor.x, y: origin.y }
    } else {
      return { x: origin.x, y: cursor.y }
    }
  }

  return {
    isOrthoEnabled: readonly(isOrthoEnabled),
    toggle,
    enable,
    disable,
    constrainPoint,
  }
}
