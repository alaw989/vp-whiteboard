<template>
  <div class="flex flex-col items-center gap-1.5">
    <canvas
      ref="canvasRef"
      :width="size"
      :height="size"
      class="rounded-full cursor-crosshair select-none touch-none"
      :style="{ width: size + 'px', height: size + 'px' }"
      @mousedown="onPointerDown"
      @mousemove="onPointerMove"
      @mouseup="onPointerUp"
      @mouseleave="onPointerUp"
      @touchstart.prevent="onTouchStart"
      @touchmove.prevent="onTouchMove"
      @touchend="onPointerUp"
    />
    <div class="flex items-center gap-1.5 w-full px-0.5">
      <div
        class="w-5 h-5 rounded border border-neutral-700 flex-shrink-0 shadow-inner"
        :style="{ backgroundColor: modelValue }"
      />
      <input
        :value="modelValue"
        type="text"
        class="flex-1 min-w-0 bg-neutral-800 text-neutral-200 text-[10px] font-mono px-1.5 py-0.5 rounded border border-neutral-700 focus:outline-none focus:border-blue-500"
        @input="onHexInput"
        @blur="onHexBlur"
        spellcheck="false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const size = 104

const canvasRef = ref<HTMLCanvasElement | null>(null)
let isDragging = false

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let r = 0, g = 0, b = 0
  const hx = hex.replace('#', '')
  if (hx.length === 6) {
    r = parseInt(hx.substring(0, 2), 16) / 255
    g = parseInt(hx.substring(2, 4), 16) / 255
    b = parseInt(hx.substring(4, 6), 16) / 255
  } else if (hx.length >= 3) {
    const hx0 = hx[0] || '0'
    const hx1 = hx[1] || '0'
    const hx2 = hx[2] || '0'
    r = parseInt(hx0 + hx0, 16) / 255
    g = parseInt(hx1 + hx1, 16) / 255
    b = parseInt(hx2 + hx2, 16) / 255
  }
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function colorAtPoint(x: number, y: number): string {
  const cx = size / 2, cy = size / 2, radius = size / 2 - 2
  const dx = x - cx, dy = y - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > radius) return props.modelValue

  let hue = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360
  let saturation = Math.min(dist / radius, 1) * 100
  return hslToHex(Math.round(hue), Math.round(saturation), 50)
}

function renderWheel() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cx = size / 2, cy = size / 2, radius = size / 2 - 2
  const segments = 360

  ctx.clearRect(0, 0, size, size)

  for (let a = 0; a < segments; a++) {
    const startAngle = (a / segments) * Math.PI * 2 - Math.PI / 2
    const endAngle = ((a + 1) / segments) * Math.PI * 2 - Math.PI / 2

    for (let r = 1; r <= radius; r++) {
      const saturation = (r / radius) * 100
      const color = hslToHex(Math.round((a / segments) * 360), Math.round(saturation), 50)

      ctx.beginPath()
      ctx.arc(cx, cy, r, startAngle, endAngle)
      ctx.lineWidth = 1
      ctx.strokeStyle = color
      ctx.stroke()
    }
  }

  const hsl = hexToHsl(props.modelValue)
  const indicatorAngle = (hsl.h / 360) * Math.PI * 2 - Math.PI / 2
  const indicatorDist = (hsl.s / 100) * radius
  const ix = cx + Math.cos(indicatorAngle) * indicatorDist
  const iy = cy + Math.sin(indicatorAngle) * indicatorDist

  ctx.beginPath()
  ctx.arc(ix, iy, 5, 0, Math.PI * 2)
  ctx.strokeStyle = hsl.l > 60 ? '#000' : '#fff'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(ix, iy, 3, 0, Math.PI * 2)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

function pickColor(event: { offsetX: number; offsetY: number }) {
  const hsl = hexToHsl(props.modelValue)
  const hex = colorAtPoint(event.offsetX, event.offsetY)
  if (hex !== props.modelValue) {
    emit('update:modelValue', hex)
  }
}

function onPointerDown(e: MouseEvent) {
  isDragging = true
  pickColor(e)
}

function onPointerMove(e: MouseEvent) {
  if (isDragging) pickColor(e)
}

function onPointerUp() {
  isDragging = false
}

function onTouchStart(e: TouchEvent) {
  isDragging = true
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect && e.touches[0]) {
    pickColor({ offsetX: e.touches[0].clientX - rect.left, offsetY: e.touches[0].clientY - rect.top })
  }
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging) return
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect && e.touches[0]) {
    pickColor({ offsetX: e.touches[0].clientX - rect.left, offsetY: e.touches[0].clientY - rect.top })
  }
}

function validateHex(value: string): string {
  const hex = value.replace(/[^0-9a-fA-F]/g, '').substring(0, 6)
  if (hex.length < 6) return value
  return '#' + hex.toLowerCase()
}

let hexDirty = false

function onHexInput(e: Event) {
  hexDirty = true
  const val = (e.target as HTMLInputElement).value
  const cleaned = validateHex(val)
  if (cleaned !== val) {
    ;(e.target as HTMLInputElement).value = cleaned
  }
  if (/^#[0-9a-f]{6}$/i.test(cleaned)) {
    emit('update:modelValue', cleaned)
  }
}

function onHexBlur(e: Event) {
  hexDirty = false
  const val = (e.target as HTMLInputElement).value
  if (/^#[0-9a-f]{6}$/i.test(val)) {
    emit('update:modelValue', val)
  } else {
    ;(e.target as HTMLInputElement).value = props.modelValue
  }
}

watch(() => props.modelValue, () => {
  if (!hexDirty) {
    renderWheel()
  }
})

onMounted(renderWheel)
</script>
