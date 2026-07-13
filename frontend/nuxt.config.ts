// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-07-13',
  devtools: { enabled: true },
  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/icon',
  ],

  typescript: {
    strict: true,
    typeCheck: false,
  },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      title: 'VP Associates - Collaborative Whiteboard',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Real-time collaborative whiteboard for structural engineering project drawings' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
        },
      ],
    },
  },

  // Nitro server configuration
  nitro: {
    preset: 'node-server',
    experimental: {
      websocket: true,
    },
  },

  // Runtime config for environment variables
  runtimeConfig: {
    // Private keys (server-side only)
    laravelUrl: process.env.LARAVEL_URL || 'http://localhost:8000',
    wsPort: parseInt(process.env.WS_PORT || '3001'),

    // Public keys (exposed to client)
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      wsUrl: process.env.NUXT_PUBLIC_WS_URL || 'ws://localhost:3001',
      laravelUrl: process.env.NUXT_PUBLIC_LARAVEL_URL || 'http://localhost:8000',
    },
  },

  // Experimental features
  experimental: {
    typedPages: true,
  },

  // Vite configuration
  vite: {
    build: {
      chunkSizeWarningLimit: 500,
    },
    optimizeDeps: {
      include: ['perfect-freehand'],
    },
  },
})
