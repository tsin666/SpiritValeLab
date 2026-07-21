<script setup lang="ts">
import type { BuildStatValue } from '~/composables/useApi'

const props = withDefaults(defineProps<{
  modelValue: BuildStatValue[]
  statTypes: string[]
  max?: number
  uniqueType?: boolean
  allowSubject?: boolean
}>(), {
  max: 8,
  uniqueType: false,
  allowSubject: true
})

const emit = defineEmits<{
  'update:modelValue': [value: BuildStatValue[]]
}>()

const { t } = useI18n()
const { statText } = useGameLocale()
const meaningfulStatTypes = computed(() => props.statTypes.filter(type => type && type !== 'None'))

const duplicateKeys = computed(() => {
  const counts = new Map<string, number>()
  for (const item of props.modelValue) {
    const key = props.uniqueType ? item.type : `${item.type}:${item.subjectId || ''}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key))
})

function availableType() {
  const used = new Set(props.modelValue.map(item => item.type))
  if (!props.uniqueType) return meaningfulStatTypes.value[0] || ''
  return meaningfulStatTypes.value.find(type => !used.has(type)) || ''
}

function addStat() {
  if (props.modelValue.length >= props.max) return
  const type = availableType()
  if (!type) return
  emit('update:modelValue', [...props.modelValue, { type, value: 0, unit: 'flat' }])
}

function removeStat(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, itemIndex) => itemIndex !== index))
}

function patchStat(index: number, patch: Partial<BuildStatValue>) {
  emit('update:modelValue', props.modelValue.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
}

function numberValue(event: Event, fallback = 0) {
  const raw = Number((event.target as HTMLInputElement).value)
  return Number.isFinite(raw) ? raw : fallback
}

function optionalNumberValue(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  if (!value) return undefined
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function optionalText(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  return value || undefined
}

function rowIsDuplicate(item: BuildStatValue) {
  const key = props.uniqueType ? item.type : `${item.type}:${item.subjectId || ''}`
  return duplicateKeys.value.has(key)
}
</script>

<template>
  <div class="build-stat-editor">
    <div v-if="modelValue.length" class="build-stat-editor__rows">
      <div v-for="(item, index) in modelValue" :key="index" class="build-stat-editor__row" :class="{ 'has-error': rowIsDuplicate(item) }" :aria-invalid="rowIsDuplicate(item) || undefined">
        <label>
          <span>{{ t('builder.loadout.editor.statType') }}</span>
          <select :value="item.type" @change="patchStat(index, { type: ($event.target as HTMLSelectElement).value })">
            <option v-for="type in meaningfulStatTypes" :key="type" :value="type">{{ statText(type) || type }}</option>
          </select>
        </label>
        <label>
          <span>{{ t('builder.loadout.editor.baseValue') }}</span>
          <input type="number" step="any" min="-1000000000" max="1000000000" :value="item.value" @input="patchStat(index, { value: numberValue($event) })">
        </label>
        <label>
          <span>{{ t('builder.loadout.editor.bonusValue') }}</span>
          <input type="number" step="any" min="-1000000000" max="1000000000" :value="item.bonus ?? ''" :placeholder="t('builder.loadout.editor.optional')" @input="patchStat(index, { bonus: optionalNumberValue($event) })">
        </label>
        <label>
          <span>{{ t('builder.loadout.editor.unit') }}</span>
          <select :value="item.unit || 'flat'" @change="patchStat(index, { unit: ($event.target as HTMLSelectElement).value as BuildStatValue['unit'] })">
            <option value="flat">{{ t('builder.loadout.editor.flat') }}</option>
            <option value="percent">%</option>
          </select>
        </label>
        <label v-if="allowSubject">
          <span>{{ t('builder.loadout.editor.subjectId') }}</span>
          <input :value="item.subjectId || ''" maxlength="120" :placeholder="t('builder.loadout.editor.optional')" @input="patchStat(index, { subjectId: optionalText($event) })">
        </label>
        <button type="button" :aria-label="t('builder.loadout.editor.removeStat')" @click="removeStat(index)">×</button>
        <small v-if="rowIsDuplicate(item)" role="alert">{{ uniqueType ? t('builder.loadout.editor.duplicateStatType') : t('builder.loadout.editor.duplicateStatSubject') }}</small>
      </div>
    </div>
    <p v-else>{{ t('builder.loadout.editor.noStatEntries') }}</p>
    <button class="build-stat-editor__add" type="button" :disabled="modelValue.length >= max || !meaningfulStatTypes.length || (uniqueType && modelValue.length >= meaningfulStatTypes.length)" @click="addStat">
      {{ t('builder.loadout.editor.addStat') }} · {{ modelValue.length }}/{{ max }}
    </button>
  </div>
</template>

<style scoped>
.build-stat-editor { display: grid; gap: 10px; }
.build-stat-editor__rows { display: grid; gap: 8px; }
.build-stat-editor__row { display: grid; grid-template-columns: minmax(130px, 1.35fr) repeat(3, minmax(92px, .7fr)) minmax(125px, 1fr) 44px; gap: 7px; align-items: end; padding: 9px; border: 1px solid #dce8e3; border-radius: 12px; background: #f8fbfa; }
.build-stat-editor__row.has-error { border-color: #d98787; background: #fff8f7; }
.build-stat-editor label { min-width: 0; }
.build-stat-editor label > span { display: block; margin-bottom: 4px; color: #647873; font-size: 9px; font-weight: 700; }
.build-stat-editor input, .build-stat-editor select { width: 100%; min-width: 0; height: 44px; padding: 0 8px; border: 1px solid #cfddd8; border-radius: 8px; color: #193b37; background: #fff; font: inherit; font-size: 10px; }
.build-stat-editor__row > button { width: 44px; height: 44px; border: 0; border-radius: 8px; color: #a04545; background: #fbe8e6; cursor: pointer; font-size: 19px; }
.build-stat-editor__row > small { grid-column: 1 / -1; color: #a23d3d; font-size: 9px; }
.build-stat-editor > p { margin: 0; color: #82928e; font-size: 10px; }
.build-stat-editor__add { min-height: 44px; justify-self: start; padding: 8px 13px; border: 1px solid #bcd8cf; border-radius: 9px; color: #176f64; background: #eef8f5; cursor: pointer; font-size: 10px; font-weight: 750; }
.build-stat-editor__add:disabled { cursor: not-allowed; opacity: .5; }
.build-stat-editor :is(button, input, select):focus-visible { outline: 3px solid rgba(22, 141, 126, .28); outline-offset: 2px; }
@media (max-width: 820px) {
  .build-stat-editor__row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .build-stat-editor__row > button { align-self: end; }
}
@media (max-width: 520px) {
  .build-stat-editor__row { grid-template-columns: 1fr; }
}
</style>
