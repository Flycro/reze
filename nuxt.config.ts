export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vite-pwa/nuxt', '@nuxt/eslint'],

  ui: {
    theme: {
      colors: [
        'primary', 'secondary', 'success', 'info', 'warning', 'error',
        'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
        'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
        'fuchsia', 'pink', 'rose',
        'slate', 'gray', 'zinc', 'neutral', 'stone',
        'mauve', 'olive', 'mist', 'taupe',
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  compatibilityDate: '2025-01-01',

  ssr: false,

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  app: {
    head: {
      title: 'reze',
      meta: [
        { name: 'description', content: 'GitHub Project Board' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    }
  },

  vite: {
    optimizeDeps: {
      include: [
        'workbox-window',
      ]
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'reze',
      short_name: 'reze',
      description: 'GitHub Project Board',
      theme_color: '#000033',
      background_color: '#000033',
      display: 'standalone',
      icons: [
        {
          src: '/favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml'
        },
        {
          src: '/favicon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/api\.github\.com\/.*/i,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'github-api',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 5
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        },
        {
          urlPattern: /^https:\/\/avatars\.githubusercontent\.com\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'github-avatars',
            expiration: {
              maxEntries: 200,
              maxAgeSeconds: 60 * 60 * 24 * 7
            },
            cacheableResponse: {
              statuses: [0, 200]
            }
          }
        }
      ]
    },
    devOptions: {
      enabled: false
    }
  }
})
