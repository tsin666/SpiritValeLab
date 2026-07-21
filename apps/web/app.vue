<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const localeHead = useLocaleHead({ seo: { canonicalQueries: ['q', 'page'] } })

useHead(() => ({
  htmlAttrs: localeHead.value.htmlAttrs,
  link: localeHead.value.link,
  meta: localeHead.value.meta
}))

useSeoMeta({
  titleTemplate: title => title ? `${title} · SpiritVale Lab` : t('seo.defaultTitle'),
  description: () => t('seo.defaultDescription'),
  ogSiteName: () => t('site.name')
})
</script>

<template>
  <div class="site-shell">
    <header class="topbar">
      <NuxtLink class="brand" :to="localePath('/')" :aria-label="t('nav.home')"><span class="brand-mark" aria-hidden="true"><img src="/images/spiritvale-logo.png" alt=""></span><span><strong>SpiritVale</strong><small>LAB</small></span></NuxtLink>
      <nav :aria-label="t('nav.primary')"><NuxtLink :to="localePath('/builds')">{{ t('nav.builds') }}</NuxtLink><NuxtLink :to="localePath('/builder')">{{ t('nav.builderShort') }}</NuxtLink><NuxtLink :to="localePath('/classes')">{{ t('nav.classes') }}</NuxtLink><NuxtLink :to="localePath('/equipment')">{{ t('nav.equipment') }}</NuxtLink><NuxtLink :to="localePath('/catalog')">{{ t('nav.database') }}</NuxtLink></nav>
      <div class="topbar-actions"><LanguageSwitcher/><NuxtLink class="submit-button" :to="localePath('/builder')">{{ t('nav.builder') }}</NuxtLink></div>
    </header>
    <nav class="mobile-nav" :aria-label="t('nav.primary')"><NuxtLink :to="localePath('/builds')">{{ t('nav.builds') }}</NuxtLink><NuxtLink :to="localePath('/builder')">{{ t('nav.builderShort') }}</NuxtLink><NuxtLink :to="localePath('/classes')">{{ t('nav.classes') }}</NuxtLink><NuxtLink :to="localePath('/equipment')">{{ t('nav.equipment') }}</NuxtLink><NuxtLink :to="localePath('/catalog')">{{ t('nav.database') }}</NuxtLink></nav>
    <NuxtPage />
    <footer class="site-footer"><span>{{ t('site.name') }} · {{ t('site.unofficial') }}</span><span>{{ t('site.dataNotice') }}</span></footer>
  </div>
</template>
