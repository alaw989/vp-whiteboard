export function useAuth() {
  const isAuthenticated = ref(false)
  const isChecking = ref(true)

  async function verify() {
    try {
      const res = await $fetch<{ authenticated: boolean }>('/api/auth/verify')
      isAuthenticated.value = res.authenticated
    } catch {
      isAuthenticated.value = false
    } finally {
      isChecking.value = false
    }
  }

  async function login(password: string) {
    const res = await $fetch<{ success: boolean }>('/api/auth/login', {
      method: 'POST',
      body: { password },
    })
    if (res.success) {
      isAuthenticated.value = true
    }
    return res
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    isAuthenticated.value = false
    navigateTo('/login')
  }

  // Verify on first call
  verify()

  return { isAuthenticated, isChecking, login, logout, verify }
}
