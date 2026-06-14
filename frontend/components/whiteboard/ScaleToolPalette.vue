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
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-neutral-200">
            <h2 class="text-lg font-semibold text-neutral-900">Set Scale</h2>
            <p class="text-sm text-neutral-500 mt-1">Define the ratio between drawing and real-world measurements</p>
          </div>

          <!-- Form -->
          <div class="px-6 py-4 space-y-4">
            <!-- Drawing Units -->
            <div>
              <label class="block text-sm font-medium text-neutral-700 mb-2">Drawing Units</label>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="drawingUnits"
                  type="number"
                  min="0.1"
                  step="0.1"
                  class="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="1"
                />
                <select
                  v-model="drawingUnit"
                  class="px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="inches">inches</option>
                </select>
              </div>
            </div>

            <!-- Equals -->
            <div class="text-center text-neutral-400 font-medium">=</div>

            <!-- Real World Units -->
            <div>
              <label class="block text-sm font-medium text-neutral-700 mb-2">Real-World Units</label>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="realWorldUnits"
                  type="number"
                  min="0.1"
                  step="0.1"
                  class="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="10"
                />
                <select
                  v-model="realWorldUnit"
                  class="px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  <option value="feet">feet</option>
                  <option value="inches">inches</option>
                </select>
              </div>
            </div>

            <!-- Preview -->
            <div class="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <div class="flex items-start gap-2">
                <Icon name="mdi:information" class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p class="text-sm font-medium text-blue-900">Scale Preview</p>
                  <p class="text-sm text-blue-700 mt-1">{{ previewLabel }}</p>
                </div>
              </div>
            </div>

            <!-- Example -->
            <div v-if="isValid" class="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
              <p class="text-xs text-neutral-600">
                <span class="font-medium">Example:</span> A 96px line on canvas will measure as
                <span class="font-mono">{{ exampleMeasurement }}</span>
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="px-6 py-4 bg-neutral-50 flex justify-end gap-3">
            <button
              class="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              :disabled="!isValid"
              class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              @click="handleSetScale"
            >
              <Icon name="mdi:check" class="w-4 h-4" />
              Set Scale
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  show: boolean
  currentScale?: { label: string } | null
}>()

const emit = defineEmits<{
  close: []
  'set-scale': [drawingUnits: number, drawingUnit: 'inches', realWorldUnits: number, realWorldUnit: 'feet' | 'inches']
}>()

// Form state
const drawingUnits = ref(1)
const drawingUnit = ref<'inches'>('inches')
const realWorldUnits = ref(10)
const realWorldUnit = ref<'feet' | 'inches'>('feet')

// Reset form when dialog opens
watch(() => props.show, (isOpen) => {
  if (isOpen) {
    drawingUnits.value = 1
    drawingUnit.value = 'inches'
    realWorldUnits.value = 10
    realWorldUnit.value = 'feet'
  }
})

// Computed
const isValid = computed(() => {
  return drawingUnits.value > 0 && realWorldUnits.value > 0
})

const previewLabel = computed(() => {
  if (!isValid.value) {
    return 'Enter valid values to see scale'
  }

  if (realWorldUnit.value === 'feet') {
    return `${drawingUnits.value}" = ${realWorldUnits.value}'`
  }
  return `${drawingUnits.value}" = ${realWorldUnits.value}"`
})

const exampleMeasurement = computed(() => {
  if (!isValid.value) {
    return ''
  }

  // Standard screen DPI is 96 pixels per inch
  const standardDPI = 96

  // Convert real-world units to inches
  let realWorldInches = realWorldUnits.value
  if (realWorldUnit.value === 'feet') {
    realWorldInches = realWorldUnits.value * 12
  }

  // Calculate what 96 pixels (1 screen inch) equals in real world
  // If 1 drawing inch = X real inches, then 96 pixels = X real inches
  const ratio = realWorldInches / drawingUnits.value
  const screenInchInRealUnits = ratio

  if (realWorldUnit.value === 'feet') {
    const feet = Math.floor(screenInchInRealUnits / 12)
    const inches = (screenInchInRealUnits % 12).toFixed(1)
    return `${feet}' ${inches}"`
  }
  return `${screenInchInRealUnits.toFixed(2)}"`
})

function handleSetScale() {
  if (!isValid.value) return

  emit('set-scale', drawingUnits.value, drawingUnit.value, realWorldUnits.value, realWorldUnit.value)
}
</script>
