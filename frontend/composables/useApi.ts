export function useApi() {
  const nuxtApp = useNuxtApp() as unknown as {
    $api: <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>
    $ensureCsrf: () => Promise<void>
  }

  return { $api: nuxtApp.$api, $ensureCsrf: nuxtApp.$ensureCsrf }
}
