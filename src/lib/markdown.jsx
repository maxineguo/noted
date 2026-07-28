export function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-slate-800">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    ),
  )
}

// Renders the limited markdown subset Gemini is prompted to produce: ## / # headers,
// **bold**, "- " bullet lists, and plain paragraphs. Returns an array of React nodes.
export function renderMarkdown(md, opts = {}) {
  if (!md) return null
  const { headingClass = 'font-display font-semibold text-lg text-slate-900 mt-6 mb-2 first:mt-0', bodyClass = 'text-slate-600 leading-relaxed my-2.5' } = opts
  const lines = String(md).split('\n')
  const blocks = []
  let listBuffer = []

  function flushList(key) {
    if (listBuffer.length) {
      blocks.push(
        <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1.5 my-3 text-slate-600">
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
          ))}
        </ul>,
      )
      listBuffer = []
    }
  }

  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line) {
      flushList(i)
      return
    }
    if (/^#{1,6}\s/.test(line)) {
      flushList(i)
      blocks.push(
        <h3 key={i} className={headingClass}>
          {renderInline(line.replace(/^#{1,6}\s+/, ''), `h-${i}`)}
        </h3>,
      )
      return
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(line.slice(2))
      return
    }
    flushList(i)
    blocks.push(
      <p key={i} className={bodyClass}>
        {renderInline(line, `p-${i}`)}
      </p>,
    )
  })
  flushList('end')
  return blocks
}

// Plain-text version (strips markers) — used for print sheets / text estimation. Preserves
// list nesting depth so Study Sheets can render genuine indented sub-bullets instead of
// flattening everything to one level.
export function markdownToPlainSections(md) {
  if (!md) return []
  const lines = String(md).split('\n')
  const sections = []
  let current = { heading: null, paragraphs: [] }
  for (const raw of lines) {
    if (!raw.trim()) continue
    const line = raw.trim()
    if (/^#{1,6}\s/.test(line)) {
      if (current.heading || current.paragraphs.length) sections.push(current)
      current = { heading: line.replace(/^#+\s*/, ''), paragraphs: [] }
    } else if (/^[-*]\s/.test(line)) {
      const leadingSpaces = raw.length - raw.trimStart().length
      const indent = Math.min(2, Math.floor(leadingSpaces / 2))
      current.paragraphs.push({ text: line.replace(/^[-*]\s*/, '').replace(/\*\*/g, ''), indent })
    } else {
      current.paragraphs.push({ text: line.replace(/\*\*/g, ''), indent: 0 })
    }
  }
  if (current.heading || current.paragraphs.length) sections.push(current)
  return sections
}
