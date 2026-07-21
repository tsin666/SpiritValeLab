import sanitizeHtml from 'sanitize-html'

export const MAX_GUIDE_TEXT_LENGTH = 10_000

const allowedTags = [
  'p',
  'br',
  'h2',
  'h3',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'a'
] as const

const safeLinkRel = 'noopener noreferrer nofollow'

function safeHttpHref(value: string | undefined): string | undefined {
  if (!value) return undefined
  const candidate = value.trim()
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? candidate : undefined
  } catch {
    return undefined
  }
}

const sanitizerOptions: sanitizeHtml.IOptions = {
  allowedTags: [...allowedTags],
  allowedAttributes: {
    a: ['href', 'title', 'rel']
  },
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {
    a: ['http', 'https']
  },
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: false,
  nestingLimit: 100,
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
  parseStyleAttributes: false,
  transformTags: {
    // Chromium's contenteditable implementation emits these legacy/browser
    // tags for the editor commands. Canonicalize them before the allowlist is
    // applied so formatting and line breaks survive the publish round trip.
    b: 'strong',
    i: 'em',
    div: 'p',
    a: (_tagName, attributes) => {
      const href = safeHttpHref(attributes.href)
      return {
        tagName: 'a',
        attribs: {
          ...(href ? { href } : {}),
          ...(attributes.title ? { title: attributes.title } : {}),
          rel: safeLinkRel
        }
      }
    }
  }
}

/**
 * Converts editor HTML into the only representation that may be persisted.
 * The parser-backed allowlist deliberately excludes styling, media and every
 * event attribute so API callers cannot bypass the browser editor's controls.
 */
export function sanitizeGuideHtml(value: string): string {
  return sanitizeHtml(value, sanitizerOptions)
}

/**
 * Counts Unicode code points in the rendered text, not UTF-16 code units or
 * HTML markup. A private wrapper lets sanitize-html's parser expose decoded
 * descendant text without relying on regex-based tag or entity handling.
 */
export function guideHtmlTextLength(sanitizedValue: string): number {
  const rootTag = 'spiritvale-guide-text-root'
  let text = ''
  sanitizeHtml(`<${rootTag}>${sanitizedValue}</${rootTag}>`, {
    ...sanitizerOptions,
    allowedTags: [...allowedTags, rootTag],
    allowedAttributes: {},
    transformTags: {},
    exclusiveFilter: frame => {
      if (frame.tag === rootTag) text = frame.text
      return false
    }
  })
  return [...text].length
}

/**
 * Applies the output allowlist as a defense-in-depth boundary and removes
 * markup-only values such as <p><br></p> so clients can show a true empty state.
 */
export function normalizeGuideHtml(value: string): string | undefined {
  const sanitized = sanitizeGuideHtml(value)
  return guideHtmlTextLength(sanitized) > 0 ? sanitized : undefined
}
