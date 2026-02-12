<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="$emit('close')"
      >
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
            <div>
              <h2 class="text-lg font-semibold text-neutral-900">Keyboard Shortcuts</h2>
              <p class="text-sm text-neutral-500 mt-1">Speed up your workflow with keyboard shortcuts</p>
            </div>
            <button
              @click="$emit('close')"
              class="p-1 hover:bg-neutral-100 rounded-lg transition-colors"
              title="Close"
            >
              <Icon name="mdi:close" class="w-5 h-5 text-neutral-600" />
            </button>
          </div>

          <!-- Shortcuts List -->
          <div class="p-6 overflow-y-auto flex-1">
            <div class="grid md:grid-cols-2 gap-6">
              <!-- Tools Section -->
              <div>
                <h3 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Tools</h3>
                <div class="space-y-2">
                  <ShortcutItem shortcut="V" description="Select tool" />
                  <ShortcutItem shortcut="H" description="Pan tool" />
                  <ShortcutItem shortcut="P" description="Pen tool" />
                  <ShortcutItem shortcut="B" description="Highlighter tool" />
                  <ShortcutItem shortcut="L" description="Line tool" />
                  <ShortcutItem shortcut="A" description="Arrow tool" />
                  <ShortcutItem shortcut="R" description="Rectangle tool" />
                  <ShortcutItem shortcut="C" description="Circle tool" />
                  <ShortcutItem shortcut="E" description="Ellipse tool" />
                  <ShortcutItem shortcut="T" description="Text annotation" />
                  <ShortcutItem shortcut="M" description="Measure distance" />
                  <ShortcutItem shortcut="S" description="Stamp tool" />
                  <ShortcutItem shortcut="X" description="Eraser tool" />
                </div>
              </div>

              <!-- Actions Section -->
              <div>
                <h3 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Actions</h3>
                <div class="space-y-2">
                  <ShortcutItem shortcut="Ctrl+Z" description="Undo" mac="⌘+Z" />
                  <ShortcutItem shortcut="Ctrl+Y" description="Redo" mac="⌘+Shift+Z" />
                  <ShortcutItem shortcut="Ctrl+0" description="Reset zoom" mac="⌘+0" />
                  <ShortcutItem shortcut="Ctrl++" description="Zoom in" mac="⌘+" />
                  <ShortcutItem shortcut="Ctrl+-" description="Zoom out" mac="⌘+-" />
                  <ShortcutItem shortcut="Delete / Backspace" description="Delete selected" />
                  <ShortcutItem shortcut="Escape" description="Deselect / Cancel" />
                  <ShortcutItem shortcut="?" description="Show shortcuts" />
                </div>
              </div>

              <!-- View Section -->
              <div>
                <h3 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Navigation</h3>
                <div class="space-y-2">
                  <ShortcutItem shortcut="Space + Drag" description="Pan canvas" />
                  <ShortcutItem shortcut="Mouse Wheel" description="Zoom in/out" />
                  <ShortcutItem shortcut="Shift + Wheel" description="Horizontal pan" />
                  <ShortcutItem shortcut="Ctrl + Wheel" description="Zoom faster" mac="⌘ + Wheel" />
                </div>
              </div>

              <!-- Drawing Section -->
              <div>
                <h3 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">While Drawing</h3>
                <div class="space-y-2">
                  <ShortcutItem shortcut="Shift" description="Constrain angle (15°)" />
                  <ShortcutItem shortcut="Alt" description="Draw from center" mac="Option" />
                  <ShortcutItem shortcut="Esc" description="Cancel drawing" />
                  <ShortcutItem shortcut="Double-click" description="Finish shape" />
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex-shrink-0">
            <div class="flex items-center justify-between">
              <p class="text-sm text-neutral-500">
                Press <kbd class="px-2 py-0.5 bg-neutral-200 rounded text-xs font-mono">?</kbd> anytime to open this dialog
              </p>
              <button
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                @click="$emit('close')"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { h, computed } from 'vue'

defineProps<{
  show: boolean
}>()

defineEmits<{
  close: []
}>()

// Detect if user is on Mac for displaying correct shortcuts
const isMac = computed(() => {
  if (import.meta.client) {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0
  }
  return false
})

// Props for ShortcutItem
interface ShortcutItemProps {
  shortcut: string
  description: string
  mac?: string
}

// Shortcut item component
const ShortcutItem = (props: ShortcutItemProps) => {
  const displayShortcut = isMac.value && props.mac ? props.mac : props.shortcut

  return h('div', { class: 'flex items-center justify-between py-1.5' }, [
    h('span', { class: 'text-sm text-neutral-600 pr-4' }, props.description),
    h('kbd', { class: 'px-2 py-1 bg-neutral-100 border border-neutral-300 rounded text-xs font-mono text-neutral-700 whitespace-nowrap' }, displayShortcut)
  ])
}
</script>
