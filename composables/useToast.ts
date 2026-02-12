import { ref, h, createApp } from 'vue'
import ToastNotification from '~/components/ToastNotification.vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'
export type ToastPosition = 'top-right' | 'top-center' | 'bottom-right'

interface ToastOptions {
  message: string
  title?: string
  type?: ToastType
  position?: ToastPosition
  duration?: number
  dismissible?: boolean
}

// Track active toast
let activeToast: {
  container: HTMLElement
  close: () => void
} | null = null

/**
 * Show a toast notification to the user.
 * Replaces any existing toast with the new one.
 *
 * @example
 * // Simple success message
 * toast('Link copied to clipboard', 'success')
 *
 * // With options
 * toast({
 *   message: 'Failed to save whiteboard',
 *   title: 'Error',
 *   type: 'error',
 *   duration: 5000
 * })
 */
export function useToast() {
  const show = ref(false)
  const message = ref('')
  const title = ref('')
  const type = ref<ToastType>('info')
  const position = ref<ToastPosition>('top-right')
  const duration = ref(3000)
  const dismissible = ref(true)

  /**
   * Show a toast notification
   * @param options - Toast configuration options or message string
   * @param toastType - Type of toast (used if options is string)
   */
  function toast(options: ToastOptions | string, toastType?: ToastType) {
    // Close any existing toast first
    if (activeToast) {
      activeToast.close()
      activeToast = null
    }

    // Parse options (support both object and string shorthand)
    const opts: ToastOptions = typeof options === 'string'
      ? { message: options, type: toastType }
      : options

    // Update reactive values
    message.value = opts.message
    title.value = opts.title || ''
    type.value = opts.type || 'info'
    position.value = opts.position || 'top-right'
    duration.value = opts.duration ?? 3000
    dismissible.value = opts.dismissible ?? true
    show.value = true

    // Create container for portal
    const container = document.createElement('div')
    document.body.appendChild(container)

    // Create Vue app and mount
    const app = createApp({
      render() {
        return h(ToastNotification, {
          show: show.value,
          message: message.value,
          title: title.value,
          type: type.value,
          position: position.value,
          duration: duration.value,
          dismissible: dismissible.value,
          onClose: () => {
            show.value = false
          },
        })
      },
    })

    const vm = app.mount(container)

    // Store close function
    activeToast = {
      container,
      close: () => {
        show.value = false
        // Allow exit animation to complete before unmounting
        setTimeout(() => {
          app.unmount()
          container.remove()
          activeToast = null
        }, 300)
      },
    }
  }

  /**
   * Shorthand for success toast
   */
  function success(message: string, options?: Partial<ToastOptions>) {
    toast({ ...options, message, type: 'success' })
  }

  /**
   * Shorthand for error toast
   */
  function error(message: string, options?: Partial<ToastOptions>) {
    toast({ ...options, message, type: 'error' })
  }

  /**
   * Shorthand for info toast
   */
  function info(message: string, options?: Partial<ToastOptions>) {
    toast({ ...options, message, type: 'info' })
  }

  /**
   * Shorthand for warning toast
   */
  function warning(message: string, options?: Partial<ToastOptions>) {
    toast({ ...options, message, type: 'warning' })
  }

  return {
    toast,
    success,
    error,
    info,
    warning,
  }
}

// Global singleton instance for convenience
let globalToast: ReturnType<typeof useToast> | null = null

/**
 * Global toast function that can be called from anywhere.
 * Creates singleton instance on first call.
 */
export function toast(options: ToastOptions | string, type?: ToastType) {
  if (!globalToast) {
    globalToast = useToast()
  }
  globalToast.toast(options, type)
}

// Shorthand exports
export function toastSuccess(message: string, options?: Partial<ToastOptions>) {
  toast({ ...options, message, type: 'success' })
}

export function toastError(message: string, options?: Partial<ToastOptions>) {
  toast({ ...options, message, type: 'error' })
}

export function toastInfo(message: string, options?: Partial<ToastOptions>) {
  toast({ ...options, message, type: 'info' })
}

export function toastWarning(message: string, options?: Partial<ToastOptions>) {
  toast({ ...options, message, type: 'warning' })
}
