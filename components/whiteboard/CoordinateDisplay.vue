<template>
  <div class="coordinate-display absolute bottom-0 left-0 z-10 bg-gray-900/80 text-gray-300 font-mono text-xs px-3 py-1.5 flex items-center gap-4 pointer-events-none select-none">
    <span>X: <span class="text-gray-100">{{ formattedX }}</span></span>
    <span>Y: <span class="text-gray-100">{{ formattedY }}</span></span>
    <span v-if="distance !== null" class="text-cyan-400">
      Dist: {{ formattedDistance }} Angle: {{ formattedAngle }}°
    </span>
    <span v-if="orthoEnabled" class="text-yellow-400 font-bold">ORTHO</span>
    <span v-if="polarEnabled" class="text-cyan-400 font-bold">POLAR</span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  x: number
  y: number
  distance?: number | null
  angle?: number | null
  pixelsPerInch?: number
  unit?: 'inches' | 'feet'
  orthoEnabled?: boolean
  polarEnabled?: boolean
}>()

const formattedX = computed(() => {
  const val = props.unit === 'feet' ? props.x / (props.pixelsPerInch || 96) / 12 : props.x / (props.pixelsPerInch || 96)
  return val.toFixed(2)
})

const formattedY = computed(() => {
  const val = props.unit === 'feet' ? -props.y / (props.pixelsPerInch || 96) / 12 : -props.y / (props.pixelsPerInch || 96)
  return val.toFixed(2)
})

const formattedDistance = computed(() => {
  if (props.distance == null) return '0.00'
  const val = props.unit === 'feet' ? props.distance / (props.pixelsPerInch || 96) / 12 : props.distance / (props.pixelsPerInch || 96)
  return val.toFixed(2)
})

const formattedAngle = computed(() => {
  if (props.angle == null) return '0.0'
  return props.angle.toFixed(1)
})
</script>
