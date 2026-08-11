<template>
  <div class="h-screen flex items-center justify-center bg-neutral-100">
    <div class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p class="text-neutral-600">Redirecting...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const laravelUrl = (config.public.laravelUrl as string) || 'http://localhost:8000'
const token = String((route.params as any).id || '')

useHead({ title: 'Redirecting...' })

// Resolve share link client-side. First load is handled by the server route
// (server/routes/s/[id].get.ts), but client-side navigation to /s/:token goes
// through this page — so it must call the live resolver, NOT the old dead
// /api/sessions/{id} endpoint. Mirrors the server route: valid → board (carry
// ?share= so the page stashes it for the WS handshake), expired (410) vs
// revoked/unknown (404) → the friendly share-invalid page.
async function resolveShareLink() {
  const redirectInvalid = (reason: 'expired' | 'not_found') =>
    navigateTo(`/share-invalid?reason=${reason}`, { redirectCode: 302 })

  if (!token) {
    await redirectInvalid('not_found')
    return
  }

  try {
    const res = await $fetch<{ success: boolean; data?: { whiteboard_id: string } }>(
      `${laravelUrl}/api/shares/${encodeURIComponent(token)}`
    )
    if (res.success && res.data?.whiteboard_id) {
      await navigateTo(
        `/whiteboard/${res.data.whiteboard_id}?share=${encodeURIComponent(token)}`,
        { redirectCode: 302 },
      )
    } else {
      await redirectInvalid('not_found')
    }
  } catch (e) {
    const err = e as { response?: { status?: number }; status?: number; statusCode?: number }
    const status = err?.response?.status ?? err?.status ?? err?.statusCode
    await redirectInvalid(status === 410 ? 'expired' : 'not_found')
  }
}

if (import.meta.client) {
  resolveShareLink()
}
</script>
