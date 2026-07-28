import { useState, useMemo, Fragment } from 'react'
import { Printer, Info, RotateCw, Sparkles, ImagePlus } from 'lucide-react'
import { markdownToPlainSections, renderInline } from '../../lib/markdown'
import { PrimaryButton, SecondaryButton, EmptyHint } from '../ui.jsx'

// ---------- Layout constants (all inches; CSS `in` units map 1:1 on screen and when printed) ----------
const PAGE_W = 8.5
const PAGE_H = 11
const MARGIN = 0.45
const USABLE_W = PAGE_W - MARGIN * 2
const USABLE_H = PAGE_H - MARGIN * 2
const BODY_FONT_PT = 11 // comfortable, fixed reading size — pages flex in COUNT instead of text shrinking to fit
const VOCAB_FONT_PT = 9.5
const MIN_STRIP_W = 1.0
const MAX_STRIP_W = 1.5
const PREVIEW_SCALE = 0.4

const SPECIALS_OPTIONS = [
  { id: 'mindmap', label: 'Mindmap' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'chart', label: 'Chart' },
  { id: 'graphs', label: 'Graphs' },
]

// ---------- Text-fit estimation (heuristic, no DOM measurement needed) ----------
function estimateHeightIn(text, widthIn, fontPt) {
  const charWidthIn = (fontPt / 72) * 0.52
  const charsPerLine = Math.max(6, Math.floor(widthIn / charWidthIn))
  const lines = Math.max(1, Math.ceil(String(text).length / charsPerLine))
  const lineHeightIn = (fontPt * 1.32) / 72
  return lines * lineHeightIn
}

// ---------- Vocabulary flashcard strip: as narrow as the content allows, capped at 1.5in ----------
function cellHeightFor(card, widthIn) {
  const innerW = widthIn - 0.16
  return Math.max(0.3, estimateHeightIn(card.term, innerW, VOCAB_FONT_PT), estimateHeightIn(card.definition, innerW, VOCAB_FONT_PT)) + 0.1
}
function findNarrowestFittingWidth(vocabPool) {
  for (let w = MIN_STRIP_W; w <= MAX_STRIP_W; w += 0.1) {
    const totalHeight = vocabPool.reduce((sum, c) => sum + cellHeightFor(c, w), 0)
    if (totalHeight <= USABLE_H * 4) return Math.round(w * 20) / 20 // "fits within a reasonable number of edges" — refined by planFlashcards below
  }
  return MAX_STRIP_W
}

// Distributes vocab across as many sheet-edges as it takes (not capped to 2 sheets) — a big
// vocabulary list simply uses more sheets, matching "flexible pages based on sources."
function planFlashcards(vocabPool) {
  if (!vocabPool.length) return { edgeAssignments: [], stripWidth: 0, sheetsUsedByVocab: 0 }
  const stripWidth = findNarrowestFittingWidth(vocabPool)
  const sides = ['left', 'right']
  const edgeAssignments = []
  let cursor = 0
  let edgeIndex = 0
  while (cursor < vocabPool.length) {
    let h = 0
    let count = 0
    for (let i = cursor; i < vocabPool.length; i++) {
      const ch = cellHeightFor(vocabPool[i], stripWidth)
      if (h + ch > USABLE_H && count > 0) break
      h += ch
      count++
    }
    if (count === 0) count = 1 // pathological single huge card — still place it, it'll just overflow slightly
    const sheet = Math.floor(edgeIndex / 2) + 1
    const side = sides[edgeIndex % 2]
    const cards = vocabPool.slice(cursor, cursor + count)
    edgeAssignments.push({ sheet, side, cards, heights: cards.map((c) => cellHeightFor(c, stripWidth)), width: stripWidth })
    cursor += count
    edgeIndex++
  }
  const sheetsUsedByVocab = Math.max(...edgeAssignments.map((e) => e.sheet), 0)
  return { edgeAssignments, stripWidth, sheetsUsedByVocab }
}

// ---------- Flatten content into a flow of atomic items ----------
function flattenToItems(blocks) {
  const items = []
  for (const block of blocks) {
    if (block.heading) items.push({ kind: block.big ? 'big-heading' : 'heading', text: block.heading })
    if (block.images) block.images.forEach((img) => items.push({ kind: 'image', dataUrl: img.dataUrl, caption: img.caption }))
    if (block.svg) items.push({ kind: 'svg', svg: block.svg, heightIn: block.svgHeight || 2.6 })
    ;(block.paragraphs || []).forEach((p, i) => {
      if (typeof p === 'string') items.push({ kind: block.isQuestion ? 'question' : 'bullet', text: p, qIndex: block.isQuestion ? i : null, indent: 0 })
      else items.push({ kind: block.isQuestion ? 'question' : 'bullet', text: p.text, qIndex: block.isQuestion ? i : null, indent: p.indent || 0 })
    })
  }
  return items
}
const BULLET_CHARS = ['•', '◦', '▪']
function itemPrefix(item) {
  if (item.kind === 'question') return `${(item.qIndex ?? 0) + 1}. `
  if (item.kind === 'bullet') return `${BULLET_CHARS[Math.min(item.indent || 0, 2)]} `
  return ''
}
function itemHeightIn(item, widthIn) {
  const indentIn = (item.indent || 0) * 0.18
  if (item.kind === 'heading') return estimateHeightIn(item.text, widthIn, BODY_FONT_PT + 1.5) + 0.09
  if (item.kind === 'big-heading') return estimateHeightIn(item.text, widthIn, BODY_FONT_PT + 5) + 0.2
  if (item.kind === 'image') return 1.8
  if (item.kind === 'svg') return item.heightIn + 0.15
  return estimateHeightIn(itemPrefix(item) + item.text, widthIn - indentIn, BODY_FONT_PT) + 0.045
}

// Greedy fill across a SEQUENCE OF SIDES (front/back of sheet 1, then sheet 2, ...), where the
// first `sheetsUsedByVocab` sheets are narrower (they carry a flashcard edge on both sides) and
// every side after that is full width. No shrinking — more content just means more sides.
function packItemsIntoSides(items, sheetsUsedByVocab, edgeAssignments, stripWidth, safety = 0.97) {
  function widthForSide(sideIdx) {
    const sheetNum = Math.floor(sideIdx / 2) + 1
    if (sheetNum > sheetsUsedByVocab) return USABLE_W
    const stripsOnThisSheet = edgeAssignments.filter((e) => e.sheet === sheetNum).length
    return USABLE_W - stripsOnThisSheet * stripWidth
  }
  const sides = [[]]
  let used = 0
  let sideIndex = 0
  for (const item of items) {
    let width = widthForSide(sideIndex)
    let h = itemHeightIn(item, width)
    if (used + h > USABLE_H * safety && used > 0) {
      sideIndex++
      sides.push([])
      used = 0
      width = widthForSide(sideIndex)
      h = itemHeightIn(item, width)
    }
    if ((item.kind === 'heading' || item.kind === 'big-heading') && used > 0) {
      const remainingAfter = USABLE_H * safety - (used + h)
      const oneLine = (BODY_FONT_PT * 1.32) / 72
      if (remainingAfter < oneLine * 1.4) {
        sideIndex++
        sides.push([])
        used = 0
      }
    }
    sides[sideIndex].push(item)
    used += h
  }
  // Vocab-dedicated sheets still need to exist (both sides) even if content runs out first.
  while (sides.length < sheetsUsedByVocab * 2) sides.push([])
  return sides
}

function specialsToBlocks(specials, selected, includedImages) {
  const blocks = []
  if (!specials) return blocks
  if (selected.includes('mindmap') && specials.mindmap?.branches?.length) {
    blocks.push({ heading: 'Mindmap', svg: buildStaticMindmapMarkup(specials.mindmap), svgHeight: 2.9, paragraphs: [] })
  }
  if (selected.includes('timeline') && specials.timeline?.length) {
    blocks.push({ heading: 'Timeline', paragraphs: specials.timeline.map((t) => ({ text: `**${t.date}** — ${t.event}`, indent: 0 })) })
  }
  if (selected.includes('chart') && specials.chart?.data?.length) {
    const max = Math.max(...specials.chart.data.map((d) => d.value), 1)
    const axisNote = specials.chart.yLabel ? ` (${specials.chart.yLabel})` : ''
    blocks.push({
      heading: `${specials.chart.title || 'Chart'}${axisNote}`,
      paragraphs: specials.chart.data.map((d) => ({ text: `**${d.label}**  ${unicodeBar(d.value, max)}  ${d.value}`, indent: 0 })),
    })
  }
  if (selected.includes('graphs') && specials.graphs?.length) {
    specials.graphs.forEach((g) => blocks.push({ heading: g.title, paragraphs: (g.steps || []).map((s, i) => ({ text: `${i + 1}. ${s}`, indent: 0 })) }))
  }
  if (includedImages.length) {
    blocks.push({ heading: 'Images', paragraphs: [], images: includedImages })
  }
  return blocks
}
function unicodeBar(value, max, width = 16) {
  const filled = Math.max(1, Math.round((Math.max(0, value) / (max || 1)) * width))
  return '█'.repeat(Math.min(width, filled)) + '░'.repeat(Math.max(0, width - filled))
}

// Static (non-interactive) 2-level mindmap for print — matches the on-screen style rather than
// dumping the tree as rows of text.
function buildStaticMindmapMarkup(mm) {
  const branches = (mm.branches || []).slice(0, 8)
  const n = branches.length || 1
  const R = 95
  const cx = 170,
    cy = 145
  const lines = []
  const nodes = []
  branches.forEach((b, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const x = cx + R * Math.cos(angle)
    const y = cy + R * Math.sin(angle)
    lines.push(`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#cbd5e1" stroke-width="1.2"/>`)
    const w = Math.max(60, Math.min(120, b.label.length * 6 + 20))
    nodes.push(`<rect x="${x - w / 2}" y="${y - 12}" width="${w}" height="24" rx="12" fill="#dbeafe" stroke="#93c5fd"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="8" font-weight="600" fill="#1e3a8a">${escapeXml(b.label)}</text>`)
  })
  return `<svg viewBox="0 0 340 290" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">${lines.join('')}<circle cx="${cx}" cy="${cy}" r="34" fill="#2563eb"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="white">${escapeXml(truncate(mm.root, 16))}</text>${nodes.join('')}</svg>`
}
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function collectAvailableImages(notebook) {
  const images = []
  ;(notebook.lecture?.images || []).forEach((img, i) => images.push({ id: `lecture-${i}`, dataUrl: img.dataUrl, caption: img.caption || 'Lecture illustration' }))
  ;(notebook.specials?.graphImages || []).forEach((img, i) => images.push({ id: `graph-${i}`, dataUrl: img.dataUrl, caption: img.caption || 'Diagram' }))
  ;(notebook.sources || []).forEach((s) => {
    if (s.kind === 'image' && s.imageDataUrl) images.push({ id: `source-${s.id}`, dataUrl: s.imageDataUrl, caption: s.name })
  })
  return images
}

export default function StudySheets({ notebook }) {
  const [selectedSpecials, setSelectedSpecials] = useState([])
  const [selectedImages, setSelectedImages] = useState([])
  const [result, setResult] = useState(null)

  const vocabPool = useMemo(() => [...(notebook.practice?.vocabulary || []), ...(notebook.practice?.formulas || [])], [notebook.id])
  const availableSpecials = SPECIALS_OPTIONS.filter((o) => {
    const s = notebook.specials
    if (!s) return false
    if (o.id === 'mindmap') return !!s.mindmap?.branches?.length
    if (o.id === 'timeline') return !!s.timeline?.length
    if (o.id === 'chart') return !!s.chart?.data?.length
    if (o.id === 'graphs') return !!s.graphs?.length
    return false
  })
  const availableImages = useMemo(() => collectAvailableImages(notebook), [notebook.id, notebook.lecture, notebook.specials])

  if (!notebook.notes?.topics?.length) {
    return <EmptyHint icon={Sparkles} title="Nothing to print yet" body="Generate your notes in the Learning tab first — Study Sheets pulls from your notes, vocabulary, and specials." />
  }

  function toggleSpecial(id) {
    setSelectedSpecials((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  function toggleImage(id) {
    setSelectedImages((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function generate() {
    const topics = notebook.notes.topics
    const reviewPrompts = notebook.notes.reviewPrompts?.length ? notebook.notes.reviewPrompts : (notebook.topics || []).slice(0, 5).map((t) => `Explain "${t}" in your own words.`)
    const { edgeAssignments, stripWidth, sheetsUsedByVocab } = planFlashcards(vocabPool)

    const questionsBlock = { heading: 'Review Questions', paragraphs: reviewPrompts, isQuestion: true }
    const notesBlocks = topics
      .filter((t) => t.detailed)
      .map((t) => {
        const sections = markdownToPlainSections(t.detailed)
        // Stitch each topic's own sub-sections' bullets under one top-level heading per topic.
        const paragraphs = sections.flatMap((sec, i) => (i === 0 && !sec.heading ? sec.paragraphs : [{ text: sec.heading || '', indent: 0 }, ...sec.paragraphs].filter((p) => p.text)))
        return { heading: t.title, paragraphs }
      })
    const includedImages = availableImages.filter((img) => selectedImages.includes(img.id))
    const specialsBlocksRaw = specialsToBlocks(notebook.specials, selectedSpecials, includedImages)
    const specialsBlocks = specialsBlocksRaw.length ? [{ heading: 'Extras', paragraphs: [], big: true }, ...specialsBlocksRaw] : []
    const blocks = [questionsBlock, ...notesBlocks, ...specialsBlocks]

    const items = flattenToItems(blocks)
    const sides = packItemsIntoSides(items, sheetsUsedByVocab, edgeAssignments, stripWidth)
    const sheets = []
    for (let i = 0; i < sides.length; i += 2) sheets.push({ front: sides[i] || [], back: sides[i + 1] || [] })
    setResult({ sheets, edgeAssignments, stripWidth, sheetsUsedByVocab })
  }

  return (
    <div>
      {!result && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl">
          <p className="text-sm text-slate-500 mb-1">
            Pages are generated to fit your material — however many that takes. {vocabPool.length > 0 && `${vocabPool.length} vocabulary/formula term${vocabPool.length === 1 ? '' : 's'} get a foldable flashcard edge.`}
          </p>

          {availableSpecials.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Include specials</p>
              <div className="flex flex-wrap gap-2">
                {availableSpecials.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => toggleSpecial(o.id)}
                    className={`text-sm font-medium px-3.5 py-2 rounded-xl border transition ${selectedSpecials.includes(o.id) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {availableImages.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ImagePlus size={13} /> Include images
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {availableImages.map((img) => (
                  <button key={img.id} onClick={() => toggleImage(img.id)} className={`relative rounded-lg overflow-hidden border-2 transition ${selectedImages.includes(img.id) ? 'border-blue-600' : 'border-transparent'}`}>
                    <img src={img.dataUrl} alt={img.caption} className="w-full h-14 object-cover" />
                    {selectedImages.includes(img.id) && <div className="absolute inset-0 bg-blue-600/20" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 mt-6 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
            <Info size={15} className="text-slate-400 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-500 leading-relaxed">Vocabulary folds (no cutting needed) — the definition lines up directly behind the term. Everything else is short hierarchical bullets sized to comfortably fill each page.</p>
          </div>

          <PrimaryButton onClick={generate} className="w-full mt-5">
            <Printer size={16} /> Generate sheets
          </PrimaryButton>
        </div>
      )}

      {result && (
        <div>
          <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 max-w-xl">
              <RotateCw size={15} className="text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-800 leading-relaxed">
                Print <strong>double-sided, flipping on the long edge</strong> — no cutting required. Fold along the dotted line and flip the page over: the definition sits directly behind the term, same row. Each sheet prints as its
                own page — double-sided is a setting in your print dialog, not something we force. This came out to <strong>{result.sheets.length} sheet{result.sheets.length === 1 ? '' : 's'}</strong> ({result.sheets.length * 2} sides).
              </p>
            </div>
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setResult(null)}>Reconfigure</SecondaryButton>
              <PrimaryButton onClick={() => window.print()}>
                <Printer size={16} /> Print
              </PrimaryButton>
            </div>
          </div>

          <div className="print-area">
            <div className="no-print flex flex-wrap gap-6 justify-center">
              {result.sheets.map((sheet, si) => {
                const hasStrip = si < result.sheetsUsedByVocab
                const strips = result.edgeAssignments.filter((e) => e.sheet === si + 1)
                const frontStrips = hasStrip ? strips.map((s) => ({ ...s, showBack: false })) : []
                const backStrips = hasStrip ? strips.map((s) => ({ ...s, position: s.position === 'left' ? 'right' : 'left', showBack: true })) : []
                return (
                  <Fragment key={si}>
                    <PreviewFrame>
                      <SinglePage items={sheet.front} strips={frontStrips} label={`Sheet ${si + 1} · front`} />
                    </PreviewFrame>
                    <PreviewFrame>
                      <SinglePage items={sheet.back} strips={backStrips} label={`Sheet ${si + 1} · back`} />
                    </PreviewFrame>
                  </Fragment>
                )
              })}
            </div>
            <div className="print-only-pages">
              {result.sheets.map((sheet, si) => (
                <SheetPair key={`p-${si}`} sheet={sheet} sheetNumber={si + 1} hasStrip={si < result.sheetsUsedByVocab} strips={result.edgeAssignments.filter((e) => e.sheet === si + 1)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewFrame({ children }) {
  return (
    <div style={{ width: `${PAGE_W * PREVIEW_SCALE}in`, height: `${PAGE_H * PREVIEW_SCALE}in`, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div style={{ width: `${PAGE_W}in`, height: `${PAGE_H}in`, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  )
}

// Renders one physical sheet as its front + back (two separate .print-page divs, each its own
// page — never scaled/combined). If this sheet carries a flashcard edge, the back mirrors the
// edge position and shows definitions instead of terms; both sides can still carry real content
// in their non-strip area.
function SheetPair({ sheet, sheetNumber, hasStrip, strips }) {
  const frontStrips = hasStrip ? strips.map((s) => ({ ...s, showBack: false })) : []
  const backStrips = hasStrip ? strips.map((s) => ({ ...s, position: s.position === 'left' ? 'right' : 'left', showBack: true })) : []
  return (
    <>
      <SinglePage items={sheet.front} strips={frontStrips} label={`Sheet ${sheetNumber} · front`} />
      <SinglePage items={sheet.back} strips={backStrips} label={`Sheet ${sheetNumber} · back`} />
    </>
  )
}

function SinglePage({ items, strips, label }) {
  const leftStrip = strips.find((s) => s.position === 'left')
  const rightStrip = strips.find((s) => s.position === 'right')
  return (
    <div className="print-page bg-white border border-slate-200" style={{ width: `${PAGE_W}in`, height: `${PAGE_H}in`, position: 'relative', padding: `${MARGIN}in`, boxSizing: 'border-box', breakAfter: 'page', flexShrink: 0 }}>
      {strips.map((s, i) => (
        <FlashcardStrip key={i} cards={s.cards} heights={s.heights} width={s.width} showBack={s.showBack} position={s.position} />
      ))}
      <div style={{ marginLeft: leftStrip ? `${leftStrip.width}in` : 0, marginRight: rightStrip ? `${rightStrip.width}in` : 0, height: '100%', overflow: 'hidden' }}>
        {items.map((item, i) => (
          <ItemView key={i} item={item} />
        ))}
      </div>
      <div className="no-print absolute bottom-1 right-2 text-[8px] text-slate-300 uppercase tracking-wide">{label}</div>
    </div>
  )
}

function ItemView({ item }) {
  const indentIn = (item.indent || 0) * 0.18
  if (item.kind === 'big-heading') {
    return <p style={{ fontSize: `${BODY_FONT_PT + 5}pt`, fontWeight: 800, color: '#0f172a', marginTop: '0.14in', marginBottom: '0.06in', paddingTop: '0.06in', borderTop: '2px solid #1d4ed8' }}>{item.text}</p>
  }
  if (item.kind === 'heading') {
    return <p style={{ fontSize: `${BODY_FONT_PT + 1.5}pt`, fontWeight: 700, color: '#0f172a', marginTop: '0.1in', marginBottom: '0.04in' }}>{item.text}</p>
  }
  if (item.kind === 'image') {
    return (
      <div style={{ marginBottom: '0.1in' }}>
        <img src={item.dataUrl} alt={item.caption || ''} style={{ width: '100%', maxHeight: '1.6in', objectFit: 'cover', borderRadius: '4px' }} />
        {item.caption && <p style={{ fontSize: '8pt', color: '#64748b', marginTop: '0.03in' }}>{item.caption}</p>}
      </div>
    )
  }
  if (item.kind === 'svg') {
    return <div style={{ height: `${item.heightIn}in`, marginBottom: '0.1in', border: '1px solid #e2e8f0', borderRadius: '8px' }} dangerouslySetInnerHTML={{ __html: item.svg }} />
  }
  return (
    <p style={{ fontSize: `${BODY_FONT_PT}pt`, lineHeight: 1.32, color: '#1e293b', marginBottom: '0.03in', marginLeft: `${indentIn}in` }}>
      {itemPrefix(item)}
      {renderInline(item.text, item.text.slice(0, 8))}
    </p>
  )
}

function FlashcardStrip({ cards, heights, width, showBack, position }) {
  if (!cards.length) return null
  let top = 0
  return (
    <div
      style={{
        position: 'absolute',
        top: `${MARGIN}in`,
        [position]: `${MARGIN}in`,
        width: `${width}in`,
        borderRight: position === 'left' ? '1.5px dashed #94a3b8' : 'none',
        borderLeft: position === 'right' ? '1.5px dashed #94a3b8' : 'none',
      }}
    >
      {cards.map((c, i) => {
        const h = heights[i]
        const cellTop = top
        top += h
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${cellTop}in`,
              left: 0,
              width: `${width}in`,
              height: `${h}in`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              borderTop: i > 0 ? '1px dotted #cbd5e1' : 'none',
              overflow: 'hidden',
              padding: '0 0.08in',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: showBack ? '8pt' : `${VOCAB_FONT_PT}pt`, fontWeight: 600, color: showBack ? '#334155' : '#1e3a8a', lineHeight: 1.2 }}>{showBack ? c.definition : c.term}</span>
          </div>
        )
      })}
    </div>
  )
}
