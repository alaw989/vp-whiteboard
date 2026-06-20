<template>
  <div v-if="visible" class="command-line hidden md:flex flex-col bg-chrome text-chrome-fg font-mono text-xs border-t border-chrome-border">
    <!-- Output area (last 5 lines) -->
    <div ref="outputRef" class="command-output overflow-y-auto px-2 py-1 max-h-24 min-h-[3rem]">
      <div v-for="(line, i) in visibleLines" :key="i" class="whitespace-pre-wrap leading-4" :class="line.type === 'prompt' ? 'text-yellow-400' : line.type === 'error' ? 'text-red-400' : 'text-chrome-fg-muted'">
        {{ line.text }}
      </div>
    </div>
    <!-- Input area -->
    <div class="flex items-center border-t border-chrome-border px-2 py-1">
      <span class="text-green-400 mr-1">Cmd:</span>
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        class="flex-1 bg-transparent outline-none text-chrome-fg placeholder-chrome-fg-muted"
        :placeholder="promptPlaceholder"
        @keydown.enter="submitCommand"
        @keydown.escape="cancelCommand"
        @keydown.up.prevent="historyUp"
        @keydown.down.prevent="historyDown"
        @keydown.tab.prevent="autocomplete"
      />
    </div>
    <!-- Autocomplete dropdown -->
    <div v-if="completions.length > 0 && showCompletions" class="border-t border-chrome-border bg-neutral-800 max-h-32 overflow-y-auto">
      <div
        v-for="cmd in completions"
        :key="cmd.name"
        class="px-3 py-1 cursor-pointer hover:bg-neutral-700 flex justify-between"
        @click="selectCompletion(cmd)"
      >
        <span class="text-cyan-400">{{ cmd.name }}</span>
        <span class="text-chrome-fg-muted">{{ cmd.aliases.join(', ') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CommandDefinition } from '~/composables/useCommandRegistry'

const props = defineProps<{
  visible?: boolean
  outputLines: readonly string[]
  execute: (input: string) => void
  cancelPending: () => void
  getCompletions: (partial: string) => CommandDefinition[]
  isWaitingForParam?: boolean
  pendingPrompt?: string
}>()

const inputValue = ref('')
const outputRef = ref<HTMLDivElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const historyIndex = ref(-1)
const showCompletions = ref(false)

const history = ref<string[]>([])

const visibleLines = computed(() => {
  const lines = props.outputLines.slice(-5)
  return lines.map(text => ({
    text,
    type: text.startsWith('> ') ? 'input' : text.includes('Unknown') ? 'error' : text.endsWith(':') ? 'prompt' : 'output'
  }))
})

const promptPlaceholder = computed(() => {
  if (props.isWaitingForParam && props.pendingPrompt) {
    return props.pendingPrompt
  }
  return 'Type a command...'
})

const completions = computed(() => {
  const val = inputValue.value.trim()
  if (!val) return []
  return props.getCompletions(val)
})

watch(() => props.outputLines.length, () => {
  nextTick(() => {
    if (outputRef.value) {
      outputRef.value.scrollTop = outputRef.value.scrollHeight
    }
  })
})

function submitCommand() {
  const input = inputValue.value.trim()
  if (!input) return

  history.value.push(input)
  historyIndex.value = -1
  inputValue.value = ''
  showCompletions.value = false
  props.execute(input)
}

function cancelCommand() {
  inputValue.value = ''
  showCompletions.value = false
  props.cancelPending()
}

function historyUp() {
  if (history.value.length === 0) return
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++
    inputValue.value = history.value[history.value.length - 1 - historyIndex.value] ?? ''
  }
}

function historyDown() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    inputValue.value = history.value[history.value.length - 1 - historyIndex.value] ?? ''
  } else {
    historyIndex.value = -1
    inputValue.value = ''
  }
}

function autocomplete() {
  if (completions.value.length > 0) {
    inputValue.value = completions.value[0]!.name.toLowerCase()
    showCompletions.value = false
  }
}

function selectCompletion(cmd: CommandDefinition) {
  inputValue.value = cmd.name.toLowerCase()
  showCompletions.value = false
}

watch(inputValue, (val) => {
  showCompletions.value = val.trim().length > 0
})

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped>
.command-output::-webkit-scrollbar {
  width: 4px;
}
.command-output::-webkit-scrollbar-track {
  background: transparent;
}
.command-output::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 2px;
}
</style>
