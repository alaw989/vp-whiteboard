<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
    <div class="w-full max-w-sm">
      <div class="bg-white rounded-2xl shadow-xl p-8">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-gray-900">VP Associates</h1>
          <p class="text-sm text-gray-500 mt-1">Create your account</p>
        </div>

        <form @submit.prevent="handleRegister" class="space-y-4">
          <div>
            <label for="name" class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              id="name"
              v-model="name"
              type="text"
              autocomplete="name"
              required
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="Your name"
              :disabled="loading"
            />
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="you@example.com"
              :disabled="loading"
            />
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="new-password"
              required
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="Enter password"
              :disabled="loading"
            />
          </div>

          <div>
            <label for="password_confirmation" class="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              id="password_confirmation"
              v-model="passwordConfirmation"
              type="password"
              autocomplete="new-password"
              required
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="Repeat password"
              :disabled="loading"
            />
          </div>

      <div v-if="error" class="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
        {{ error }}
      </div>

      <button
        type="submit"
        class="btn-primary w-full"
        :disabled="loading || !name || !email || !password || !passwordConfirmation"
      >
        <div v-if="loading" class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
        <span v-else>Request Access</span>
      </button>
    </form>

    <div v-if="registered" class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
      <Icon name="mdi:email-check-outline" class="w-10 h-10 text-blue-600 mx-auto mb-2" />
      <h2 class="text-lg font-semibold text-blue-900">Request received</h2>
      <p class="text-sm text-blue-700 mt-1">
        Your access request has been sent to the account owner for approval.
        You'll be able to sign in once your request is approved.
      </p>
    </div>

    <p v-if="!registered" class="text-sm text-center text-gray-500 mt-6">
      Already have an account?
      <NuxtLink to="/login" class="text-blue-600 hover:underline font-medium">Sign in</NuxtLink>
    </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const { $api, $ensureCsrf: ensureCsrf } = useApi()
const name = ref('')
const email = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const error = ref('')
const loading = ref(false)
const registered = ref(false)

async function handleRegister() {
  error.value = ''
  loading.value = true

  try {
    await ensureCsrf()
    await $api('/api/register', {
      method: 'POST',
      body: {
        name: name.value,
        email: email.value,
        password: password.value,
        password_confirmation: passwordConfirmation.value,
      },
    })

    // No auto-login — the request goes to the owner for approval.
    registered.value = true
  } catch (e: any) {
    const data = e?.data
    error.value =
      data?.message ||
      (data?.errors && Object.values(data.errors).flat().join(', ')) ||
      e?.message ||
      'Registration failed'
  } finally {
    loading.value = false
  }
}

useHead({ title: 'Register - VP Associates' })
</script>
