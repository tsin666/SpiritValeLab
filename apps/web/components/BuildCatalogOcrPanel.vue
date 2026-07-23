<script setup lang="ts">
import type { BuilderOption } from '~/composables/useApi'
import type {
  BuildCatalogOcrKind,
  BuildCatalogOcrKindLabels,
  BuildCatalogOcrParsedLine,
  BuildCatalogOcrParser,
  OcrCatalogMatchResponse,
  OcrCatalogMatchType,
  OcrRecognitionLayout,
  OcrReviewDraft
} from '~/types/ocr'
import { buildCatalogOcrRequestLines } from '~/utils/ocr-catalog-panel'

const props = defineProps<{
  kind: BuildCatalogOcrKind
  options: BuilderOption[]
  layout: OcrRecognitionLayout
  kindLabels: BuildCatalogOcrKindLabels
  parseText: BuildCatalogOcrParser
}>()

const emit = defineEmits<{
  apply: [option: BuilderOption, source: BuildCatalogOcrParsedLine]
  manual: []
}>()

const { t, locale } = useI18n()
const { gameText } = useGameLocale()
const api = useApi().replace(/\/$/u, '')
const panelId = `build-catalog-ocr-${props.kind}-${useId()}`
const expanded = ref(false)
const reviewedText = ref('')
const parsedLines = ref<BuildCatalogOcrParsedLine[]>([])
const state = ref<'idle' | 'matching' | 'ready' | 'empty' | 'unmatched' | 'incompatible' | 'rate-limited' | 'failed' | 'applied'>('idle')
let requestToken = 0

type OcrSuggestion = {
  optionId: string
  source: BuildCatalogOcrParsedLine
  matchType: OcrCatalogMatchType
  score: number
}

const suggestions = ref<OcrSuggestion[]>([])

function canonical(value?: string | null) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLocaleLowerCase('en-US')
}

const compatibleOptions = computed(() => {
  const result = new Map<string, BuilderOption>()
  for (const option of props.options) {
    result.set(`id:${canonical(option.id)}`, option)
    if (option.slug) result.set(`slug:${canonical(option.slug)}`, option)
  }
  return result
})

function currentOption(id: string, slug = '') {
  return compatibleOptions.value.get(`id:${canonical(id)}`)
    || (slug ? compatibleOptions.value.get(`slug:${canonical(slug)}`) : undefined)
}

const visibleSuggestions = computed(() => suggestions.value.flatMap(suggestion => {
  const option = currentOption(suggestion.optionId)
  return option ? [{ ...suggestion, option }] : []
}))

const importerLabels = computed(() => ({
  title: t('builder.loadout.editor.ocr.importer.title', { kind: props.kindLabels.singular }),
  description: t('builder.loadout.editor.ocr.importer.description', { kind: props.kindLabels.singular, screenshot: props.kindLabels.screenshot }),
  privacy: t('builder.loadout.editor.ocr.importer.privacy'),
  chooseFile: t('builder.loadout.editor.ocr.importer.chooseFile', { screenshot: props.kindLabels.screenshot }),
  replaceFile: t('builder.loadout.editor.ocr.importer.replaceFile'),
  supportedFiles: t('builder.loadout.editor.ocr.importer.supportedFiles'),
  previewAlt: t('builder.loadout.editor.ocr.importer.previewAlt', { kind: props.kindLabels.singular }),
  start: t('builder.loadout.editor.ocr.importer.start'),
  runAgain: t('builder.loadout.editor.ocr.importer.runAgain'),
  cancel: t('builder.loadout.editor.ocr.importer.cancel'),
  clear: t('builder.loadout.editor.ocr.importer.clear'),
  validating: t('builder.loadout.editor.ocr.importer.validating'),
  preprocessing: t('builder.loadout.editor.ocr.importer.preprocessing'),
  loading: t('builder.loadout.editor.ocr.importer.loading'),
  recognizing: t('builder.loadout.editor.ocr.importer.recognizing'),
  reviewTitle: t('builder.loadout.editor.ocr.importer.reviewTitle'),
  reviewDescription: t('builder.loadout.editor.ocr.importer.reviewDescription', { kind: props.kindLabels.singular }),
  recognizedText: t('builder.loadout.editor.ocr.importer.recognizedText', { kind: props.kindLabels.singular }),
  characterCount: t('builder.loadout.editor.ocr.importer.characterCount'),
  confirm: t('builder.loadout.editor.ocr.importer.confirm'),
  emptyText: t('builder.loadout.editor.ocr.importer.emptyText'),
  fileTooLarge: t('builder.loadout.editor.ocr.importer.fileTooLarge'),
  unsupportedFormat: t('builder.loadout.editor.ocr.importer.unsupportedFormat'),
  invalidImage: t('builder.loadout.editor.ocr.importer.invalidImage'),
  dimensionsExceeded: t('builder.loadout.editor.ocr.importer.dimensionsExceeded'),
  browserUnsupported: t('builder.loadout.editor.ocr.importer.browserUnsupported'),
  genericError: t('builder.loadout.editor.ocr.importer.genericError')
}))

const statusText = computed(() => {
  if (state.value === 'matching') return t('builder.loadout.editor.ocr.matching', { kind: props.kindLabels.singular })
  if (state.value === 'ready') {
    return t('builder.loadout.editor.ocr.matchesReady', {
      count: visibleSuggestions.value.length,
      kind: props.kindLabels.singular
    })
  }
  if (state.value === 'empty') return t('builder.loadout.editor.ocr.noName', { kind: props.kindLabels.singular })
  if (state.value === 'unmatched') return t('builder.loadout.editor.ocr.noMatches', { kind: props.kindLabels.singular })
  if (state.value === 'incompatible') return t('builder.loadout.editor.ocr.noCompatible', { kind: props.kindLabels.singular })
  if (state.value === 'rate-limited') return t('builder.loadout.editor.ocr.rateLimited')
  if (state.value === 'failed') return t('builder.loadout.editor.ocr.failed')
  if (state.value === 'applied') return t('builder.loadout.editor.ocr.applied', { kind: props.kindLabels.singular })
  return ''
})

const detectedValues = computed(() => {
  const values: string[] = []
  for (const line of parsedLines.value) {
    if (line.sourceSlot) values.push(line.sourceSlot)
    if (line.partIndex !== undefined) values.push(t('builder.loadout.editor.ocr.detectedPart', { value: line.partIndex + 1 }))
    if (line.refineLevel !== undefined) values.push(t('builder.loadout.editor.ocr.detectedRefine', { value: line.refineLevel }))
    if (line.potential !== undefined) values.push(t('builder.loadout.editor.ocr.detectedPotential', { value: line.potential }))
    if (line.suffixText) values.push(t('builder.loadout.editor.ocr.detectedSuffix', { value: line.suffixText }))
  }
  return [...new Set(values)]
})

function fetchStatus(error: unknown) {
  if (!error || typeof error !== 'object') return 0
  const candidate = error as { status?: number; statusCode?: number; response?: { status?: number; _data?: { code?: string } } }
  if (candidate.response?._data?.code === 'RATE_LIMITED') return 429
  return Number(candidate.statusCode || candidate.status || candidate.response?.status || 0)
}

function requestLines(text: string) {
  const result = buildCatalogOcrRequestLines(props.kind, props.parseText(text))
  parsedLines.value = result.map(item => item.source)
  return result
}

async function confirmReview(draft: OcrReviewDraft) {
  const currentRequest = ++requestToken
  reviewedText.value = draft.text
  suggestions.value = []
  const lines = requestLines(draft.text)
  if (!lines.length) {
    state.value = 'empty'
    return
  }

  state.value = 'matching'
  try {
    const response = await $fetch<OcrCatalogMatchResponse>(`${api}/api/ocr/match`, {
      method: 'POST',
      body: { lines: lines.map(line => line.request), maxCandidates: 5 }
    })
    if (currentRequest !== requestToken) return

    const sourceById = new Map(lines.map(line => [line.request.id, line.source]))
    const nextSuggestions = new Map<string, OcrSuggestion>()
    let catalogCandidates = 0
    for (const line of response.lines) {
      const source = sourceById.get(line.lineId)
      if (!source) continue
      for (const candidate of line.candidates) {
        if (candidate.kind !== props.kind) continue
        catalogCandidates += 1
        const option = currentOption(candidate.id, candidate.slug)
        if (!option) continue
        const previous = nextSuggestions.get(option.id)
        const next = { optionId: option.id, source, matchType: candidate.matchType, score: candidate.score }
        if (!previous
          || (next.matchType === 'exact' && previous.matchType !== 'exact')
          || (next.matchType === previous.matchType && next.score > previous.score)) {
          nextSuggestions.set(option.id, next)
        }
      }
    }

    suggestions.value = [...nextSuggestions.values()]
      .sort((left, right) => (left.matchType === right.matchType ? 0 : left.matchType === 'exact' ? -1 : 1)
        || right.score - left.score
        || String(currentOption(left.optionId)?.id || '').localeCompare(String(currentOption(right.optionId)?.id || ''), locale.value))
      .slice(0, 5)
    state.value = suggestions.value.length ? 'ready' : catalogCandidates ? 'incompatible' : 'unmatched'
  } catch (error) {
    if (currentRequest !== requestToken) return
    state.value = fetchStatus(error) === 429 ? 'rate-limited' : 'failed'
  }
}

function resetCatalogOcr() {
  requestToken += 1
  reviewedText.value = ''
  parsedLines.value = []
  suggestions.value = []
  state.value = 'idle'
}

function applySuggestion(suggestion: OcrSuggestion) {
  const option = currentOption(suggestion.optionId)
  if (!option) {
    state.value = 'incompatible'
    return
  }
  emit('apply', option, suggestion.source)
  state.value = 'applied'
}

watch(() => props.options.map(option => option.id).join('\u0000'), () => {
  if (!suggestions.value.length) return
  suggestions.value = suggestions.value.filter(suggestion => Boolean(currentOption(suggestion.optionId)))
  if (!suggestions.value.length) state.value = 'incompatible'
})
</script>

<template>
  <section class="catalog-ocr">
    <button
      class="catalog-ocr__toggle"
      type="button"
      :aria-expanded="expanded"
      :aria-controls="panelId"
      @click="expanded = !expanded"
    >
      <span aria-hidden="true">▣</span>
      <strong>{{ t('builder.loadout.editor.ocr.toggle', { kind: kindLabels.singular }) }}</strong>
      <small>{{ expanded ? t('builder.loadout.editor.ocr.collapse') : t('builder.loadout.editor.ocr.expand') }}</small>
    </button>

    <div v-if="expanded" :id="panelId" class="catalog-ocr__panel">
      <BuildOcrImporter
        :labels="importerLabels"
        :layout="layout"
        :max-text-length="10000"
        @confirm="confirmReview"
        @reset="resetCatalogOcr"
      />

      <div
        v-if="statusText"
        class="catalog-ocr__status"
        :class="`catalog-ocr__status--${state}`"
        :aria-busy="state === 'matching'"
        aria-live="polite"
      >
        <strong>{{ statusText }}</strong>
        <span v-if="reviewedText">{{ t('builder.loadout.editor.ocr.confirmedTextKept', { count: reviewedText.length }) }}</span>
      </div>

      <p v-if="detectedValues.length" class="catalog-ocr__detected">
        <strong>{{ t('builder.loadout.editor.ocr.detected') }}</strong>
        <span v-for="value in detectedValues" :key="value">{{ value }}</span>
      </p>

      <div v-if="visibleSuggestions.length" class="catalog-ocr__results">
        <h4>{{ t('builder.loadout.editor.ocr.candidatesTitle', { kind: kindLabels.plural }) }}</h4>
        <p>{{ t('builder.loadout.editor.ocr.candidatesHint', { kind: kindLabels.singular }) }}</p>
        <article v-for="suggestion in visibleSuggestions" :key="suggestion.option.id">
          <img v-if="suggestion.option.icon" :src="suggestion.option.icon" alt="" loading="lazy">
          <b v-else aria-hidden="true">{{ suggestion.option.id.slice(0, 2) }}</b>
          <div>
            <strong>{{ gameText(suggestion.option.name, suggestion.option.displayName || suggestion.option.id) }}</strong>
            <span>{{ t(`builder.loadout.editor.ocr.${suggestion.matchType}`) }} · {{ t('builder.loadout.editor.ocr.matchScore', { value: Math.round(suggestion.score * 100) }) }}</span>
          </div>
          <button
            type="button"
            :aria-label="`${t('builder.loadout.editor.ocr.applyCandidate')}: ${gameText(suggestion.option.name, suggestion.option.displayName || suggestion.option.id)}`"
            @click="applySuggestion(suggestion)"
          >
            {{ t('builder.loadout.editor.ocr.applyCandidate') }}
          </button>
        </article>
      </div>

      <button v-if="state !== 'idle'" class="catalog-ocr__manual" type="button" @click="emit('manual')">
        {{ t('builder.loadout.editor.ocr.manualFallback', { kind: kindLabels.singular }) }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.catalog-ocr { display: grid; gap: 10px; margin-bottom: 12px; }
.catalog-ocr__toggle { width: 100%; min-height: 52px; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 11px; border: 1px solid #bcd8d2; border-radius: 11px; color: #17433e; background: #f4faf8; cursor: pointer; text-align: left; }
.catalog-ocr__toggle > span { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; color: #fff; background: #168d7e; font-size: 16px; }
.catalog-ocr__toggle strong { font-size: 11px; }
.catalog-ocr__toggle small { color: #627c76; font-size: 9px; }
.catalog-ocr__panel { display: grid; gap: 10px; min-width: 0; }
.catalog-ocr__status { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid #c8ddd8; border-radius: 10px; color: #365d56; background: #edf6f3; font-size: 9px; line-height: 1.5; }
.catalog-ocr__status strong { font-size: 10px; }
.catalog-ocr__status--failed, .catalog-ocr__status--rate-limited { border-color: #ebc8c4; color: #884841; background: #fff2f0; }
.catalog-ocr__status--applied { border-color: #acd8c7; color: #17634f; background: #eaf8f1; }
.catalog-ocr__detected { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin: 0; padding: 9px 11px; border-radius: 10px; color: #4b6862; background: #f2f6f5; font-size: 9px; }
.catalog-ocr__detected strong { color: #1d5149; }
.catalog-ocr__detected span { padding: 4px 7px; border-radius: 999px; color: #116b5e; background: #dcf1ec; font-weight: 750; }
.catalog-ocr__results { display: grid; gap: 8px; }
.catalog-ocr__results h4, .catalog-ocr__results p { margin: 0; }
.catalog-ocr__results h4 { color: #183f39; font-size: 13px; }
.catalog-ocr__results > p { color: #6f847f; font-size: 9px; line-height: 1.5; }
.catalog-ocr__results article { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 9px; border: 1px solid #d5e4e0; border-radius: 11px; background: #fff; }
.catalog-ocr__results article > img, .catalog-ocr__results article > b { width: 42px; height: 42px; object-fit: contain; border-radius: 9px; background: #edf5f2; }
.catalog-ocr__results article > b { display: grid; place-items: center; color: #168d7e; font-size: 10px; }
.catalog-ocr__results article > div { min-width: 0; }
.catalog-ocr__results article > div strong, .catalog-ocr__results article > div span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.catalog-ocr__results article > div strong { color: #193f39; font-size: 10px; }
.catalog-ocr__results article > div span { margin-top: 4px; color: #6f847f; font-size: 8px; }
.catalog-ocr__results article > button, .catalog-ocr__manual { min-height: 44px; padding: 8px 12px; border: 0; border-radius: 9px; font: inherit; font-size: 9px; font-weight: 800; cursor: pointer; }
.catalog-ocr__results article > button { color: #fff; background: #168d7e; }
.catalog-ocr__manual { justify-self: start; color: #22685d; background: #e5f3ef; }
.catalog-ocr :is(button):focus-visible { outline: 3px solid rgba(22, 141, 126, .28); outline-offset: 2px; }

@media (max-width: 620px) {
  .catalog-ocr__toggle { grid-template-columns: 34px minmax(0, 1fr); }
  .catalog-ocr__toggle small { grid-column: 2; }
  .catalog-ocr__results article { grid-template-columns: 42px minmax(0, 1fr); }
  .catalog-ocr__results article > button { grid-column: 1 / -1; width: 100%; }
  .catalog-ocr__manual { width: 100%; }
}
</style>
