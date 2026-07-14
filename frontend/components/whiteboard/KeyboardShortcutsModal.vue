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
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 flex-shrink-0">
            <div>
              <h2 class="text-lg font-semibold text-neutral-900">Help &amp; Reference</h2>
              <p class="text-sm text-neutral-500 mt-1">
                Press <kbd class="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 rounded text-xs font-mono">?</kbd> anytime to reopen
              </p>
            </div>
            <button
              @click="$emit('close')"
              class="p-1 hover:bg-neutral-100 rounded-lg transition-colors"
              title="Close"
            >
              <Icon name="mdi:close" class="w-5 h-5 text-neutral-600" />
            </button>
          </div>

          <!-- Tab Bar -->
          <div class="flex border-b border-neutral-200 px-6 flex-shrink-0">
            <button
              :class="[
                'py-3 px-4 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === 'shortcuts'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              ]"
              @click="tab = 'shortcuts'"
            >
              Shortcuts
            </button>
            <button
              :class="[
                'py-3 px-4 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === 'tools'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              ]"
              @click="tab = 'tools'"
            >
              Tools
            </button>
          </div>

          <!-- Tab: Shortcuts -->
          <div v-if="tab === 'shortcuts'" class="p-6 overflow-y-auto flex-1">
            <div class="grid md:grid-cols-2 gap-6">
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
                  <ShortcutItem shortcut="Shift+M" description="Measure area" />
                  <ShortcutItem shortcut="S" description="Stamp tool" />
                  <ShortcutItem shortcut="X" description="Eraser tool" />
                </div>
              </div>

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

                <h3 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 mt-6">Navigation</h3>
                <div class="space-y-2">
                  <ShortcutItem shortcut="Space + Drag" description="Pan canvas" />
                  <ShortcutItem shortcut="Mouse Wheel" description="Zoom in/out" />
                  <ShortcutItem shortcut="Shift + Wheel" description="Horizontal pan" />
                  <ShortcutItem shortcut="Ctrl + Wheel" description="Zoom faster" mac="⌘ + Wheel" />
                </div>

                <h3 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 mt-6">While Drawing</h3>
                <div class="space-y-2">
                  <ShortcutItem shortcut="Shift" description="Constrain angle (15°)" />
                  <ShortcutItem shortcut="Alt" description="Draw from center" mac="Option" />
                  <ShortcutItem shortcut="Esc" description="Cancel drawing" />
                  <ShortcutItem shortcut="Double-click" description="Finish shape" />
                </div>
              </div>
            </div>
          </div>

          <!-- Tab: Tools Reference -->
          <div v-else class="p-6 overflow-y-auto flex-1">
            <div class="space-y-8">
              <div v-for="section in toolSections" :key="section.label">
                <h3 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">{{ section.label }}</h3>
                <div class="space-y-1">
                  <div
                    v-for="tool in section.tools"
                    :key="tool.id"
                    class="flex items-start gap-3 py-2 px-2 rounded-lg hover:bg-neutral-50 -mx-2 transition-colors"
                  >
                    <Icon :name="tool.icon" class="w-5 h-5 text-neutral-500 mt-0.5 flex-shrink-0" />
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-neutral-900">{{ tool.name }}</span>
                        <kbd class="px-1.5 py-0.5 bg-neutral-100 border border-neutral-300 rounded text-[10px] font-mono text-neutral-600 whitespace-nowrap">{{ tool.shortcut }}</kbd>
                      </div>
                      <p class="text-xs text-neutral-500 mt-0.5">{{ tool.description }}</p>
                    </div>
                  </div>
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
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
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
import { h, ref, computed } from 'vue'

defineProps<{ show: boolean }>()
defineEmits<{ close: [] }>()

const tab = ref<'shortcuts' | 'tools'>('shortcuts')

// Detect if user is on Mac for displaying correct shortcuts
const isMac = computed(() => {
  if (import.meta.client) {
    return navigator.platform.toUpperCase().indexOf('MAC') >= 0
  }
  return false
})

interface ShortcutItemProps {
  shortcut: string
  description: string
  mac?: string
}

const ShortcutItem = (props: ShortcutItemProps) => {
  const displayShortcut = isMac.value && props.mac ? props.mac : props.shortcut
  return h('div', { class: 'flex items-center justify-between py-1.5' }, [
    h('span', { class: 'text-sm text-neutral-600 pr-4' }, props.description),
    h('kbd', { class: 'px-2 py-1 bg-neutral-100 border border-neutral-300 rounded text-xs font-mono text-neutral-700 whitespace-nowrap' }, displayShortcut),
  ])
}

interface ToolEntry {
  id: string
  name: string
  shortcut: string
  icon: string
  description: string
}

interface ToolSection {
  label: string
  tools: ToolEntry[]
}

const toolSections: ToolSection[] = [
  {
    label: 'Nav',
    tools: [
      { id: 'select', name: 'Select', shortcut: 'V', icon: 'mdi:cursor-default', description: 'Click any element to select it' },
      { id: 'pan', name: 'Pan', shortcut: 'H', icon: 'mdi:pan', description: 'Drag to scroll the canvas' },
    ],
  },
  {
    label: 'Draw',
    tools: [
      { id: 'pen', name: 'Pen', shortcut: 'P', icon: 'mdi:pencil', description: 'Freehand drawing with pressure-sensitive strokes' },
      { id: 'highlighter', name: 'Highlighter', shortcut: 'B', icon: 'mdi:marker', description: 'Translucent freehand highlighting' },
      { id: 'line', name: 'Line', shortcut: 'L', icon: 'mdi:vector-line', description: 'Straight line between two click points' },
      { id: 'arrow', name: 'Arrow', shortcut: 'A', icon: 'mdi:arrow-top-right', description: 'Line with an arrowhead at the end' },
      { id: 'rectangle', name: 'Rectangle', shortcut: 'R', icon: 'mdi:rectangle-outline', description: 'Rectangle from two opposite corners' },
      { id: 'circle', name: 'Circle', shortcut: 'C', icon: 'mdi:circle-outline', description: 'Circle defined by center and radius' },
      { id: 'ellipse', name: 'Ellipse', shortcut: 'E', icon: 'mdi:ellipse-outline', description: 'Ellipse within a bounding box' },
      { id: 'polyline', name: 'Polyline', shortcut: 'PL', icon: 'mdi:vector-polyline', description: 'Connected line segments — click per vertex, Enter to finish' },
      { id: 'arc', name: 'Arc', shortcut: 'ARC', icon: 'mdi:vector-curve', description: 'Circular arc defined by three points' },
      { id: 'revision-cloud', name: 'Revision Cloud', shortcut: 'RC', icon: 'mdi:cloud-outline', description: 'Closed cloud shape for revision markups' },
    ],
  },
  {
    label: 'Modify',
    tools: [
      { id: 'offset', name: 'Offset', shortcut: 'OFF', icon: 'mdi:format-line-spacing', description: 'Create a parallel copy at a specified distance' },
      { id: 'mirror', name: 'Mirror', shortcut: 'MI', icon: 'mdi:flip-horizontal', description: 'Mirror selection across a user-defined axis' },
      { id: 'rotate', name: 'Rotate', shortcut: 'RO', icon: 'mdi:rotate-right', description: 'Rotate selection around a base point' },
      { id: 'scale', name: 'Scale', shortcut: 'SC', icon: 'mdi:arrow-expand', description: 'Uniformly scale selection from a base point' },
      { id: 'trim', name: 'Trim', shortcut: 'TR', icon: 'mdi:content-cut', description: 'Trim a line at its intersection with a cutting edge' },
      { id: 'extend', name: 'Extend', shortcut: 'EX', icon: 'mdi:arrow-expand-horizontal', description: 'Extend a line to meet a boundary edge' },
      { id: 'fillet', name: 'Fillet', shortcut: 'F', icon: 'mdi:vector-radius', description: 'Rounded corner between two intersecting lines' },
      { id: 'eraser', name: 'Eraser', shortcut: 'X', icon: 'mdi:eraser', description: 'Click or drag over elements to delete them' },
    ],
  },
  {
    label: 'Annotate',
    tools: [
      { id: 'text-annotation', name: 'Text Annotation', shortcut: 'T', icon: 'mdi:comment-text-outline', description: 'Add a text note with a leader line pointing to a location' },
      { id: 'dimension', name: 'Dimension', shortcut: 'DIM', icon: 'mdi:ruler-square', description: 'Linear dimension showing distance between two points' },
      { id: 'stamp', name: 'Stamp', shortcut: 'S', icon: 'mdi:certificate', description: 'Place a colored stamp — Approved, Revised, Note, or For Review' },
    ],
  },
  {
    label: 'Measure',
    tools: [
      { id: 'measure-distance', name: 'Measure Distance', shortcut: 'M', icon: 'mdi:ruler', description: 'Measure the real-world distance between two points' },
      { id: 'measure-area', name: 'Measure Area', shortcut: 'Shift+M', icon: 'mdi:chart-box-outline', description: 'Calculate the area of a rectangle, circle, or ellipse' },
    ],
  },
]
</script>
