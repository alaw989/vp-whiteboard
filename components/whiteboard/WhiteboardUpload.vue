<template>
  <div
    :class="[
      'upload-zone border-2 border-dashed rounded-lg transition-all',
      isDragging
        ? 'border-blue-400 bg-blue-50'
        : 'border-neutral-300 hover:border-neutral-400'
    ]"
    @dragenter.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @dragover.prevent
    @drop.prevent="handleDrop"
  >
    <!-- Upload Prompt -->
    <div v-if="!file" class="p-8 text-center">
      <Icon name="mdi:cloud-upload" class="w-12 h-12 text-neutral-400 mx-auto mb-3" />
      <p class="text-neutral-600 mb-2">
        Drag & drop a file here, or
        <label class="text-blue-600 hover:text-blue-700 cursor-pointer">
          browse
          <input
            type="file"
            class="hidden"
            :accept="acceptedTypes"
            @change="handleFileSelect"
          />
        </label>
      </p>
      <p class="text-sm text-neutral-400">
        Supports: JPEG, PNG, WebP, PDF (max 10MB)
      </p>
    </div>

    <!-- File Preview -->
    <div v-else class="p-4">
      <div class="flex items-center gap-3 mb-3">
        <!-- File Icon -->
        <div class="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
          <Icon
            :name="getFileIcon(file.type)"
            class="w-6 h-6 text-neutral-600"
          />
        </div>

        <!-- File Info -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-neutral-900 truncate" :title="file.name">
            {{ file.name }}
          </p>
          <p class="text-xs text-neutral-500">
            {{ formatFileSize(file.size) }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 flex-shrink-0">
          <button
            v-if="!uploading && !uploadSuccess"
            class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Upload"
            @click="startUpload"
          >
            <Icon name="mdi:upload" class="w-5 h-5" />
          </button>
          <button
            v-if="uploading"
            class="p-2 text-neutral-400 cursor-not-allowed"
            title="Uploading..."
            disabled
          >
            <Icon name="mdi:loading" class="w-5 h-5 animate-spin" />
          </button>
          <button
            class="p-2 text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            title="Remove"
            @click="removeFile"
          >
            <Icon name="mdi:close" class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Upload Progress Bar -->
      <div v-if="uploading" class="space-y-2">
        <div class="h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-blue-600 transition-all duration-200 ease-out"
            :style="{ width: `${uploadProgress.percent}%` }"
          />
        </div>
        <div class="flex justify-between items-center text-xs text-neutral-500">
          <span>Uploading {{ file.name }}...</span>
          <span class="font-medium">{{ uploadProgress.percent }}%</span>
        </div>
        <!-- Optional: detailed progress -->
        <div class="text-xs text-neutral-400 text-center">
          {{ formatFileSize(uploadProgress.loaded) }} of {{ formatFileSize(uploadProgress.total) }}
        </div>
      </div>

      <!-- Success State -->
      <div v-if="uploadSuccess && !uploading" class="mt-3 p-3 bg-green-50 text-green-700 text-sm rounded-lg flex items-center gap-2">
        <Icon name="mdi:check-circle" class="w-5 h-5 flex-shrink-0" />
        <span class="font-medium">File uploaded successfully</span>
      </div>

      <!-- Error State -->
      <div v-if="uploadError && !uploading" class="mt-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start gap-2">
        <Icon name="mdi:alert-circle" class="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>{{ uploadError }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UploadResult, UploadProgress } from '~/types'

const props = defineProps<{
  whiteboardId: string
}>()

const emit = defineEmits<{
  'upload-success': [result: UploadResult]
  'upload-error': [error: string]
}>()

// Composables
const { uploadFile, validateFile, formatFileSize, getFileIcon } = useFileUpload()

// State
const isDragging = ref(false)
const file = ref<File | null>(null)
const uploading = ref(false)
const uploadProgress = ref<UploadProgress>({ loaded: 0, total: 0, percent: 0 })
const uploadSuccess = ref(false)
const uploadError = ref('')

// Accepts attribute for file input
const acceptedTypes = 'image/jpeg,image/png,image/webp,application/pdf'

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) {
    setFile(input.files[0])
  }
  // Reset input so same file can be selected again if needed
  input.value = ''
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  const droppedFile = event.dataTransfer?.files?.[0]
  if (droppedFile) {
    setFile(droppedFile)
  }
}

function setFile(newFile: File) {
  // Reset states
  uploadError.value = ''
  uploadSuccess.value = false
  uploadProgress.value = { loaded: 0, total: 0, percent: 0 }

  // Validate file using composable
  const validation = validateFile(newFile)
  if (!validation.valid) {
    uploadError.value = validation.error || 'Invalid file'
    return
  }

  file.value = newFile
}

async function startUpload() {
  if (!file.value || uploading.value) return

  uploading.value = true
  uploadError.value = ''
  uploadSuccess.value = false
  uploadProgress.value = { loaded: 0, total: file.value.size, percent: 0 }

  try {
    const result = await uploadFile(props.whiteboardId, file.value, {
      onProgress: (progress) => {
        uploadProgress.value = progress
      },
    })

    if (result.success && result.data) {
      uploadProgress.value = { loaded: result.data.fileRecord?.file_size || 0, total: result.data.fileRecord?.file_size || 0, percent: 100 }
      uploadSuccess.value = true
      emit('upload-success', result.data)
    } else {
      uploadError.value = result.error || 'Upload failed'
      emit('upload-error', uploadError.value)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Upload failed'
    uploadError.value = errorMsg
    emit('upload-error', errorMsg)
  } finally {
    uploading.value = false
  }
}

function removeFile() {
  file.value = null
  uploadSuccess.value = false
  uploadError.value = ''
  uploadProgress.value = { loaded: 0, total: 0, percent: 0 }
}
</script>
