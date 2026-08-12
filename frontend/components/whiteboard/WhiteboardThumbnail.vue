<template>
  <div
    class="w-full h-24 rounded-lg bg-slate-50 overflow-hidden relative"
  >
    <canvas
      ref="canvasEl"
      class="w-full h-full"
      :class="drawable ? '' : 'invisible'"
      :aria-label="`Thumbnail preview of ${name}`"
    />
    <div
      v-if="!drawable"
      class="absolute inset-0 flex items-center justify-center"
    >
      <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
        <Icon name="mdi:clipboard-text" class="w-5 h-5 text-blue-600" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CanvasElement } from '~/types'
import { drawThumbnail } from '~/utils/dashboard'

const props = withDefaults(defineProps<{
  elements?: CanvasElement[] | null
  name?: string
}>(), {
  elements: null,
  name: '',
})

const canvasEl = ref<HTMLCanvasElement | null>(null)
const drawable = ref(false)

function render() {
  const el = canvasEl.value
  if (!el) return
  // SSR guard: draw only when a real canvas exists (client-side).
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  el.width = Math.max(1, Math.round((el.clientWidth || 320) * dpr))
  el.height = Math.max(1, Math.round((el.clientHeight || 96) * dpr))
  drawable.value = drawThumbnail(el, props.elements ?? [])
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(render)
  // Re-render when the card's box size changes so the backing store stays at
  // the current CSS size × DPI — the responsive grid reflows on viewport
  // resize (md:grid-cols-2 lg:grid-cols-3), and browser zoom / moving the
  // window across monitors changes devicePixelRatio. Without this the canvas
  // keeps its mount-time size and the preview goes blurry or stale.
  if (typeof ResizeObserver !== 'undefined' && canvasEl.value) {
    resizeObserver = new ResizeObserver(() => nextTick(render))
    resizeObserver.observe(canvasEl.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(
  () => props.elements,
  () => nextTick(render),
)
</script>
