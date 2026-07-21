<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: string
  maxLength?: number
  ariaLabel?: string
  placeholder?: string
}>(), {
  maxLength: 10_000,
  ariaLabel: '',
  placeholder: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:textLength': [value: number]
  limit: []
}>()

const { t } = useI18n()
const editor = ref<HTMLElement | null>(null)
const textLength = ref(0)
const limitReached = ref(false)
let lastAcceptedHtml = props.modelValue
let composing = false
let syncRevision = 0

function editorText(value: HTMLElement | null) {
  // textContent matches the API sanitizer's decoded descendant-text count:
  // layout-only block boundaries and <br> elements do not consume characters.
  return value?.textContent || ''
}

function countText(value: string) {
  return [...value].length
}

function syncLength() {
  textLength.value = countText(editorText(editor.value))
  emit('update:textLength', textLength.value)
}

function syncFromEditor() {
  if (!editor.value || composing) return
  syncRevision += 1
  const nextText = editorText(editor.value)
  const nextLength = countText(nextText)
  if (nextLength > props.maxLength) {
    editor.value.innerHTML = lastAcceptedHtml
    syncLength()
    editor.value.focus()
    limitReached.value = true
    emit('limit')
    return
  }

  // Chromium leaves <br> or <div><br></div> behind after deleting all text.
  // Normalize that state so the placeholder and optional-field semantics recover.
  if (!nextText.replace(/\u200b/g, '').trim()) {
    editor.value.innerHTML = ''
    lastAcceptedHtml = ''
    limitReached.value = false
    textLength.value = 0
    emit('update:modelValue', '')
    emit('update:textLength', 0)
    return
  }
  lastAcceptedHtml = editor.value.innerHTML
  limitReached.value = false
  textLength.value = nextLength
  emit('update:modelValue', lastAcceptedHtml)
  emit('update:textLength', nextLength)
}

function run(command: string, value?: string) {
  editor.value?.focus()
  document.execCommand(command, false, value)
  syncFromEditor()
}

function addLink() {
  const selection = window.getSelection()
  const selectedRange = selection?.rangeCount && editor.value?.contains(selection.anchorNode)
    ? selection.getRangeAt(0).cloneRange()
    : null
  const value = window.prompt(t('builder.richText.linkPrompt'), 'https://')?.trim()
  if (!value || !/^https?:\/\//i.test(value)) return
  if (selectedRange && selection) {
    editor.value?.focus()
    selection.removeAllRanges()
    selection.addRange(selectedRange)
  }
  run('createLink', value)
}

function handlePaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!text) return
  const revisionBeforeInsert = syncRevision
  const inserted = document.execCommand('insertText', false, text)
  if (!inserted && editor.value) {
    const selection = window.getSelection()
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!selection || !range || !editor.value.contains(range.commonAncestorContainer)) return
    range.deleteContents()
    const fragment = document.createDocumentFragment()
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
    let lastNode: Node | null = null
    lines.forEach((line, index) => {
      if (index) {
        lastNode = document.createElement('br')
        fragment.append(lastNode)
      }
      if (line) {
        lastNode = document.createTextNode(line)
        fragment.append(lastNode)
      }
    })
    range.insertNode(fragment)
    if (lastNode) {
      range.setStartAfter(lastNode)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }
  // execCommand fires an input event in Chromium. Avoid syncing twice because
  // a second pass would immediately clear the just-emitted limit warning.
  if (syncRevision === revisionBeforeInsert) syncFromEditor()
}

function handleCompositionStart() {
  composing = true
}

function handleCompositionEnd() {
  composing = false
  syncFromEditor()
}

watch(() => props.modelValue, value => {
  if (!editor.value || editor.value.innerHTML === value) return
  editor.value.innerHTML = value
  lastAcceptedHtml = value
  syncLength()
})

onMounted(() => {
  if (!editor.value) return
  editor.value.innerHTML = props.modelValue
  lastAcceptedHtml = props.modelValue
  syncLength()
})
</script>

<template>
  <div class="rich-text-editor" :class="{ 'rich-text-editor--limit': textLength >= maxLength }">
    <div class="rich-text-editor__toolbar" role="toolbar" :aria-label="t('builder.richText.toolbar')">
      <button type="button" :title="t('builder.richText.paragraph')" :aria-label="t('builder.richText.paragraph')" @mousedown.prevent @click="run('formatBlock', 'p')">P</button>
      <button type="button" :title="t('builder.richText.heading2')" :aria-label="t('builder.richText.heading2')" @mousedown.prevent @click="run('formatBlock', 'h2')">H2</button>
      <button type="button" :title="t('builder.richText.heading3')" :aria-label="t('builder.richText.heading3')" @mousedown.prevent @click="run('formatBlock', 'h3')">H3</button>
      <span aria-hidden="true"/>
      <button type="button" :title="t('builder.richText.bold')" :aria-label="t('builder.richText.bold')" @mousedown.prevent @click="run('bold')"><strong>B</strong></button>
      <button type="button" :title="t('builder.richText.italic')" :aria-label="t('builder.richText.italic')" @mousedown.prevent @click="run('italic')"><em>I</em></button>
      <button type="button" :title="t('builder.richText.quote')" :aria-label="t('builder.richText.quote')" @mousedown.prevent @click="run('formatBlock', 'blockquote')">❝</button>
      <button type="button" :title="t('builder.richText.code')" :aria-label="t('builder.richText.code')" @mousedown.prevent @click="run('formatBlock', 'pre')">&lt;/&gt;</button>
      <span aria-hidden="true"/>
      <button type="button" :title="t('builder.richText.bulletList')" :aria-label="t('builder.richText.bulletList')" @mousedown.prevent @click="run('insertUnorderedList')">• List</button>
      <button type="button" :title="t('builder.richText.numberedList')" :aria-label="t('builder.richText.numberedList')" @mousedown.prevent @click="run('insertOrderedList')">1. List</button>
      <button type="button" :title="t('builder.richText.link')" :aria-label="t('builder.richText.link')" @mousedown.prevent @click="addLink">↗</button>
      <button type="button" :title="t('builder.richText.clearFormatting')" :aria-label="t('builder.richText.clearFormatting')" @mousedown.prevent @click="run('removeFormat')">Tx</button>
    </div>
    <div
      ref="editor"
      class="rich-text-editor__content"
      contenteditable="true"
      role="textbox"
      aria-multiline="true"
      :aria-label="ariaLabel"
      :data-placeholder="placeholder"
      @input="syncFromEditor"
      @paste="handlePaste"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
    />
    <footer>
      <span role="status" aria-live="polite">{{ limitReached ? t('builder.richText.limitReached', { max: maxLength }) : t('builder.richText.safeFormatting') }}</span>
      <strong>{{ t('builder.richText.characterCount', { count: textLength, max: maxLength }) }}</strong>
    </footer>
  </div>
</template>

<style scoped>
.rich-text-editor { overflow:hidden; border:1px solid #d4e1dc; border-radius:12px; background:#fff; transition:border-color .16s,box-shadow .16s; }
.rich-text-editor:focus-within { border-color:#4fb9aa; box-shadow:0 0 0 4px rgba(31,159,141,.1); }
.rich-text-editor--limit { border-color:#d99983; }
.rich-text-editor__toolbar { min-height:42px; display:flex; align-items:center; gap:4px; padding:6px 8px; overflow-x:auto; border-bottom:1px solid #e2ebe7; background:#f5f8f6; }
.rich-text-editor__toolbar button { min-width:34px; height:34px; padding:0 9px; border:1px solid transparent; border-radius:7px; color:#365c57; background:transparent; cursor:pointer; font-size:11px; font-weight:700; line-height:1; white-space:nowrap; }
.rich-text-editor__toolbar button:hover,.rich-text-editor__toolbar button:focus-visible { border-color:#c1d9d1; color:#0b7569; background:#fff; outline:none; }
.rich-text-editor__toolbar>span { width:1px; height:20px; flex:0 0 auto; margin:0 3px; background:#d8e4df; }
.rich-text-editor__content { min-height:190px; max-height:560px; padding:16px 18px; overflow:auto; outline:0; color:#294d49; font-size:12px; line-height:1.75; }
.rich-text-editor__content:empty::before { color:#94a39f; content:attr(data-placeholder); pointer-events:none; }
.rich-text-editor__content :deep(h2) { margin:14px 0 7px; font-size:18px; }
.rich-text-editor__content :deep(h3) { margin:12px 0 6px; font-size:15px; }
.rich-text-editor__content :deep(p) { margin:6px 0; }
.rich-text-editor__content :deep(blockquote) { margin:10px 0; padding:7px 11px; border-left:3px solid #48aa9d; color:#5e7470; background:#f1f7f4; }
.rich-text-editor__content :deep(pre) { padding:10px; overflow:auto; border-radius:8px; color:#dff9f3; background:#123d3a; font:10px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace; }
.rich-text-editor__content :deep(a) { color:#087f70; text-decoration:underline; }
.rich-text-editor footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 10px; border-top:1px solid #edf2ef; color:#80908c; background:#fbfcfb; font-size:10px; }
.rich-text-editor footer strong { color:#277d72; font-size:10px; }
.rich-text-editor--limit footer strong { color:#b15c43; }
@media (max-width:600px) { .rich-text-editor__toolbar button { min-width:40px; height:40px; }.rich-text-editor__content { min-height:160px; padding:13px; }.rich-text-editor footer { align-items:flex-start; flex-direction:column; gap:3px; } }
</style>
