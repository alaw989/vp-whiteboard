export interface PolarTrackingOptions {
  enabled?: boolean
  angles?: number[]
  threshold?: number
}

export interface PolarTrackingResult {
  point: { x: number; y: number }
  angle: number
  snapped: boolean
}

export function usePolarTracking(options: PolarTrackingOptions = {}) {
  const isPolarEnabled = ref(options.enabled ?? false)
  const trackedAngles = ref(options.angles ?? [0, 45, 90, 135, 180, 225, 270, 315])
  const threshold = ref(options.threshold ?? 5) // degrees

  function toggle() {
    isPolarEnabled.value = !isPolarEnabled.value
  }

  function enable() {
    isPolarEnabled.value = true
  }

  function disable() {
    isPolarEnabled.value = false
  }

  function setAngles(angles: number[]) {
    trackedAngles.value = angles
  }

  /**
   * Snap cursor to nearest tracked angle from origin.
   * Returns constrained point + angle info.
   */
  function constrainPoint(
    origin: { x: number; y: number },
    cursor: { x: number; y: number }
  ): PolarTrackingResult {
    const dx = cursor.x - origin.x
    const dy = cursor.y - origin.y
    const distance = Math.hypot(dx, dy)

    if (distance < 1) {
      return { point: cursor, angle: 0, snapped: false }
    }

    // Calculate angle in degrees (0° = right, counterclockwise positive in screen coords)
    const cursorAngle = ((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360

    // Find nearest tracked angle within threshold
    let nearestAngle = cursorAngle
    let minDiff = threshold.value

    for (const trackedAngle of trackedAngles.value) {
      let diff = Math.abs(cursorAngle - trackedAngle)
      if (diff > 180) diff = 360 - diff

      if (diff < minDiff) {
        minDiff = diff
        nearestAngle = trackedAngle
      }
    }

    const snapped = minDiff < threshold.value

    if (!snapped) {
      return { point: cursor, angle: cursorAngle, snapped: false }
    }

    // Project cursor distance along tracked angle direction
    const rad = (nearestAngle * Math.PI) / 180
    return {
      point: {
        x: origin.x + distance * Math.cos(rad),
        y: origin.y - distance * Math.sin(rad),
      },
      angle: nearestAngle,
      snapped: true,
    }
  }

  return {
    isPolarEnabled: readonly(isPolarEnabled),
    trackedAngles: readonly(trackedAngles),
    threshold,
    toggle,
    enable,
    disable,
    setAngles,
    constrainPoint,
  }
}
