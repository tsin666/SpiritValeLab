export default defineNuxtConfig({
  modules: ['@nuxtjs/i18n'],
  i18n: {
    baseUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000',
    defaultLocale: 'zh',
    strategy: 'prefix_except_default',
    locales: [
      { code: 'zh', name: '简体中文', language: 'zh-CN', file: 'zh-CN.json' },
      { code: 'en', name: 'English', language: 'en-US', file: 'en.json' }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'spiritvale_locale',
      redirectOn: 'root'
    }
  },
  runtimeConfig: { public: { apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://127.0.0.1:4100' } },
  compatibilityDate: '2026-07-21',
  devtools: { enabled: true },
  nitro: { preset: 'node-server' },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      meta: [
        { name: 'theme-color', content: '#083f3d' }
      ]
    }
  }
})
