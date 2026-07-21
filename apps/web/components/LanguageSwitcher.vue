<script setup lang="ts">
const { locale, locales, setLocale, t } = useI18n()

async function switchLanguage(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'zh' || value === 'en') await setLocale(value)
}
</script>

<template>
  <label class="language-switcher">
    <span class="sr-only">{{ t('language.label') }}</span>
    <select :value="locale" :aria-label="t('language.label')" @change="switchLanguage">
      <option v-for="item in locales" :key="item.code" :value="item.code">
        {{ t(`language.${item.code}`) }}
      </option>
    </select>
  </label>
</template>
