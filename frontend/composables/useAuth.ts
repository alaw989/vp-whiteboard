export function useAuth() {
  const { $api, $ensureCsrf: ensureCsrf } = useNuxtApp()
  const isAuthenticated = ref(false)
  const isChecking = ref(true)

  async function verify() {
    try {
      const res = await $api<{ authenticated: boolean; user?: unknown }>('/api/user')
      isAuthenticated.value = !!res
    } catch {
      isAuthenticated.value = false
    } finally {
      isChecking.value = false
    }
  }

  async function login(email: string, password: string) {
    await ensureCsrf()
    try {
      await $api('/api/login', {
        method: 'POST',
        body: { email, password },
      })
      isAuthenticated.value = true
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }
    }
  }

  async function register(name: string, email: string, password: string) {
    await ensureCsrf()
    try {
      await $api('/api/register', {
        method: 'POST',
        body: { name, email, password, password_confirmation: password },
      })
      isAuthenticated.value = true
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      }
    }
  }

  async function logout() {
    try {
      await $api('/api/logout', { method: 'POST' })
    } catch {
      // Ignore errors
    }
    isAuthenticated.value = false
    navigateTo('/login')
  }

  // Verify on first call
  verify()

  return { isAuthenticated, isChecking, login, register, logout, verify }
}
