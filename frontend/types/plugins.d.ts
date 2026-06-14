// Type augmentation for $api and ensureCsrf provided by plugins/api.client.ts
declare module '#app' {
  interface NuxtApp {
    $api: <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>
    $ensureCsrf: () => Promise<void>
  }
}

export {}
