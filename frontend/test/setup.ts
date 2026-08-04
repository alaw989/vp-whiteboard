// Mirrors Nuxt's Vue auto-imports for components/ in the vitest environment.
// Nuxt auto-imports `watch`, `computed`, `ref`, etc. into .vue <script setup>;
// plain vitest does not, so register them on globalThis for the SFCs under test.
import {
  ref,
  computed,
  watch,
  reactive,
  readonly,
  nextTick,
  onMounted,
  onUnmounted,
  onBeforeMount,
  onBeforeUnmount,
  provide,
  inject,
  toRef,
  toRefs,
  shallowRef,
  shallowReactive,
  defineComponent,
  h,
} from 'vue'

const g = globalThis as Record<string, unknown>
g.ref = ref
g.computed = computed
g.watch = watch
g.reactive = reactive
g.readonly = readonly
g.nextTick = nextTick
g.onMounted = onMounted
g.onUnmounted = onUnmounted
g.onBeforeMount = onBeforeMount
g.onBeforeUnmount = onBeforeUnmount
g.provide = provide
g.inject = inject
g.toRef = toRef
g.toRefs = toRefs
g.shallowRef = shallowRef
g.shallowReactive = shallowReactive
g.defineComponent = defineComponent
g.h = h
