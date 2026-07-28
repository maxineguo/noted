import { useState } from 'react'
import { List, GitBranch, Calendar, BarChart3, Image as ImageIcon, Printer, ArrowLeft, ArrowDown, Sparkles, Wand2, ChevronLeft, ChevronRight, Eye, Pencil, Plus, Trash2, X as XIcon } from 'lucide-react'
import { generateLazySpecial, generateCustomSpecial, generateIllustration, inferSubjectTheme } from '../../lib/gemini'
import { downscaleDataUrl } from '../../lib/fileParsing'
import { uid } from '../../lib/storage'
import { EmptyHint, EditableText, Modal, Field, inputClass, PrimaryButton, SecondaryButton, Spinner } from '../ui.jsx'
import StudySheets from './StudySheets.jsx'

const CARDS = [
  { id: 'outline', title: 'Outline notes', desc: 'Every topic and its main idea, at a glance.', icon: List, gradient: 'from-rose-400 to-pink-600' },
  { id: 'mindmap', title: 'Mindmap', desc: 'Click a branch to expand it, step by step.', icon: GitBranch, gradient: 'from-violet-400 to-purple-700' },
  { id: 'timeline', title: 'Timeline', desc: 'Key events in chronological order.', icon: Calendar, gradient: 'from-amber-400 to-orange-600' },
  { id: 'chart', title: 'Charts', desc: 'Quantitative comparisons & data.', icon: BarChart3, gradient: 'from-teal-400 to-emerald-600' },
  { id: 'graphs', title: 'Graphs & Images', desc: 'Diagrams and illustrations, explained.', icon: ImageIcon, gradient: 'from-blue-400 to-blue-700' },
  { id: 'sheets', title: 'Study Sheets', desc: 'Printable study sheets with foldable flashcard edges.', icon: Printer, gradient: 'from-cyan-400 to-blue-600' },
]

const CUSTOM_TYPES = [
  { id: 'slidedeck', label: 'Slide deck' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'infographic', label: 'Infographic' },
  { id: 'report', label: 'Report' },
  { id: 'custom', label: 'Custom' },
]

export default function Specials({ notebook, onSave, apiKey, onNeedApiKey }) {
  const [open, setOpen] = useState(null)
  const [customModalOpen, setCustomModalOpen] = useState(false)
  const [viewingCustomId, setViewingCustomId] = useState(null)

  if (!notebook.generated) {
    return <EmptyHint icon={GitBranch} title="No specials yet" body="Generate study materials in Creation to build mindmaps, timelines, charts, and more." />
  }

  const customItems = notebook.specials?.custom || []

  function saveSpecialsPatch(patch) {
    onSave({ ...notebook, specials: { ...(notebook.specials || {}), ...patch } })
  }
  function saveCustomItem(item) {
    onSave({ ...notebook, specials: { ...(notebook.specials || {}), custom: [item, ...customItems] } })
  }
  function updateCustomItem(id, data) {
    onSave({ ...notebook, specials: { ...(notebook.specials || {}), custom: customItems.map((c) => (c.id === id ? { ...c, data } : c)) } })
  }
  function deleteCustomItem(id) {
    onSave({ ...notebook, specials: { ...(notebook.specials || {}), custom: customItems.filter((c) => c.id !== id) } })
    setViewingCustomId(null)
  }

  if (viewingCustomId) {
    const item = customItems.find((c) => c.id === viewingCustomId)
    if (!item) {
      setViewingCustomId(null)
      return null
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => setViewingCustomId(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition">
            <ArrowLeft size={15} /> Back to specials
          </button>
          <button onClick={() => deleteCustomItem(item.id)} className="flex items-center gap-1.5 text-sm text-rose-500 hover:text-rose-600 transition">
            <Trash2 size={13} /> Delete
          </button>
        </div>
        <h3 className="font-display text-xl font-semibold text-slate-900 mb-4">{item.data.title || item.label}</h3>
        <CustomSpecialView item={item} notebook={notebook} onChange={(data) => updateCustomItem(item.id, data)} />
      </div>
    )
  }

  if (open) {
    const card = CARDS.find((c) => c.id === open)
    return (
      <div>
        <button onClick={() => setOpen(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5 transition">
          <ArrowLeft size={15} /> Back to specials
        </button>
        <h3 className="font-display text-xl font-semibold text-slate-900 mb-4">{card.title}</h3>
        {open === 'outline' && <OutlineView notebook={notebook} onSave={onSave} />}
        {open === 'mindmap' && (
          <LazySpecial notebook={notebook} apiKey={apiKey} onNeedApiKey={onNeedApiKey} kind="mindmap" onGenerated={saveSpecialsPatch} exists={!!notebook.specials?.mindmap}>
            <MindmapView notebook={notebook} onSave={onSave} />
          </LazySpecial>
        )}
        {open === 'timeline' && (
          <LazySpecial notebook={notebook} apiKey={apiKey} onNeedApiKey={onNeedApiKey} kind="timeline" onGenerated={saveSpecialsPatch} exists={!!notebook.specials?.timeline?.length}>
            <TimelineView notebook={notebook} onSave={onSave} />
          </LazySpecial>
        )}
        {open === 'chart' && (
          <LazySpecial notebook={notebook} apiKey={apiKey} onNeedApiKey={onNeedApiKey} kind="chart" onGenerated={saveSpecialsPatch} exists={!!notebook.specials?.chart}>
            <ChartView notebook={notebook} onSave={onSave} />
          </LazySpecial>
        )}
        {open === 'graphs' && <GraphsSection notebook={notebook} apiKey={apiKey} onNeedApiKey={onNeedApiKey} onSave={onSave} />}
        {open === 'sheets' && <StudySheets notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {CARDS.map((c) => (
        <button key={c.id} onClick={() => setOpen(c.id)} className="text-left rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className={`h-28 bg-gradient-to-br ${c.gradient} flex items-center justify-center text-white`}>
            <c.icon size={28} />
          </div>
          <div className="p-4">
            <h4 className="font-display font-semibold text-slate-900">{c.title}</h4>
            <p className="text-sm text-slate-500 mt-0.5">{c.desc}</p>
          </div>
        </button>
      ))}

      <button onClick={() => setCustomModalOpen(true)} className="sm:col-span-2 lg:col-span-3 text-left rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-300 transition-all p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white flex items-center justify-center shrink-0">
          <Wand2 size={22} />
        </div>
        <div className="flex-1">
          <h4 className="font-display font-semibold text-slate-900">Custom</h4>
          <p className="text-sm text-slate-500 mt-0.5">Slide deck, flashcards, infographic, report — or describe exactly what you want.</p>
        </div>
        {customItems.length > 0 && <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2.5 py-1 rounded-full shrink-0">{customItems.length} made</span>}
      </button>

      {customItems.length > 0 && (
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
          {customItems.map((item) => (
            <button key={item.id} onClick={() => setViewingCustomId(item.id)} className="flex items-center gap-1.5 text-sm text-slate-600 bg-white border border-slate-200 hover:border-blue-200 hover:bg-blue-50/50 rounded-xl px-3.5 py-2 transition">
              <Eye size={13} /> {item.data.title || item.label}
            </button>
          ))}
        </div>
      )}

      {customModalOpen && (
        <CustomSpecialModal
          notebook={notebook}
          apiKey={apiKey}
          onNeedApiKey={onNeedApiKey}
          onClose={() => setCustomModalOpen(false)}
          onCreated={(item) => {
            saveCustomItem(item)
            setCustomModalOpen(false)
            setViewingCustomId(item.id)
          }}
        />
      )}
    </div>
  )
}

// ---------- Lazy generation wrapper for Mindmap / Timeline / Chart ----------
function LazySpecial({ notebook, apiKey, onNeedApiKey, kind, onGenerated, exists, children }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await generateLazySpecial({ apiKey, notebook, kind })
      onGenerated(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!exists) {
    return (
      <EmptyHint
        icon={Sparkles}
        title="Not generated yet"
        body="This one's built on demand to keep API usage light — generate it now and it's saved for next time."
        action={
          <div>
            <PrimaryButton onClick={generate} busy={busy}>
              Generate
            </PrimaryButton>
            {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
          </div>
        }
      />
    )
  }
  return children
}

// ---------- Outline (topic + main idea, shared with Notes' topic list) ----------
function OutlineView({ notebook, onSave }) {
  const topics = notebook.notes?.topics || []
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(topics)

  if (!topics.length) return <p className="text-slate-400">No outline available — generate Notes first.</p>

  function startEdit() {
    setDraft(topics.map((t) => ({ ...t })))
    setEditing(true)
  }
  function save() {
    onSave({ ...notebook, notes: { ...notebook.notes, topics: draft } })
    setEditing(false)
  }
  function updateRow(i, field, value) {
    setDraft((d) => d.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
  }
  function removeRow(i) {
    setDraft((d) => d.filter((_, idx) => idx !== i))
  }
  function addRow() {
    setDraft((d) => [...d, { id: uid('topic'), title: 'New topic', mainIdea: '', detailed: null }])
  }

  if (editing) {
    return (
      <div className="max-w-3xl bg-white border border-slate-200 rounded-2xl p-6 md:p-8">
        <div className="space-y-3">
          {draft.map((t, i) => (
            <div key={t.id} className="flex items-start gap-2">
              <span className="text-sm font-semibold text-blue-600 mt-2 w-6 shrink-0">{toRoman(i + 1)}.</span>
              <div className="flex-1 space-y-1.5">
                <input value={t.title} onChange={(e) => updateRow(i, 'title', e.target.value)} className={inputClass} placeholder="Topic title" />
                <input value={t.mainIdea} onChange={(e) => updateRow(i, 'mainIdea', e.target.value)} className={`${inputClass} text-slate-500`} placeholder="Main idea" />
              </div>
              <button onClick={() => removeRow(i)} className="w-8 h-8 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center transition mt-1 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-4">
          <Plus size={14} /> Add topic
        </button>
        <div className="flex gap-2 mt-5">
          <PrimaryButton onClick={save}>Save</PrimaryButton>
          <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
        </div>
      </div>
    )
  }

  return (
    <div className="relative group max-w-3xl">
      <button onClick={startEdit} className="absolute top-3 right-3 z-10 flex items-center gap-1 text-xs font-medium bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-blue-600 hover:border-blue-200 rounded-full px-3 py-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
        <Pencil size={12} /> Edit
      </button>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-4">
        {topics.map((t, i) => (
          <div key={t.id}>
            <p className="font-semibold text-slate-900">
              {toRoman(i + 1)}. {t.title}
            </p>
            {t.mainIdea && <p className="text-slate-500 text-sm mt-0.5 pl-6">{t.mainIdea}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
function toRoman(n) {
  const vals = [10, 9, 5, 4, 1]
  const syms = ['X', 'IX', 'V', 'IV', 'I']
  let r = ''
  let num = n
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) {
      r += syms[i]
      num -= vals[i]
    }
  }
  return r
}

// ---------- Mindmap: progressive disclosure (root + 1 level, click to drill in/out) ----------
function textWidth(text, fontPx) {
  return String(text).length * fontPx * 0.68
}

function getNodeAtPath(mm, path) {
  let level = mm.branches || []
  let node = null
  for (const idx of path) {
    node = level[idx]
    level = node?.children || []
  }
  return node
}
function updateNodeAtPath(mm, path, updater) {
  if (!path.length) return { ...mm, branches: updater(mm.branches) }
  const [head, ...rest] = path
  const branches = (mm.branches || []).map((b, i) => {
    if (i !== head) return b
    if (rest.length === 0) return updater([b])[0]
    return { ...b, children: updateChildrenAtPath(b.children || [], rest, updater) }
  })
  return { ...mm, branches }
}
function updateChildrenAtPath(children, path, updater) {
  const [head, ...rest] = path
  return children.map((c, i) => {
    if (i !== head) return c
    if (rest.length === 0) return updater([c])[0]
    return { ...c, children: updateChildrenAtPath(c.children || [], rest, updater) }
  })
}

function MindmapView({ notebook, onSave }) {
  const mm = notebook.specials?.mindmap
  const [path, setPath] = useState([])
  const [editing, setEditing] = useState(false)

  if (!mm || !mm.branches?.length) return <p className="text-slate-400">No mindmap available for this material.</p>

  const focusNode = getNodeAtPath(mm, path)
  const displayed = focusNode ? focusNode.children || [] : mm.branches
  const centerLabel = focusNode ? focusNode.label : mm.root

  function saveMindmap(nextMm) {
    onSave({ ...notebook, specials: { ...notebook.specials, mindmap: nextMm } })
  }

  function selectChild(idx) {
    if (editing) return
    const child = displayed[idx]
    if (child?.children?.length) setPath([...path, idx])
  }
  function collapseUp() {
    if (path.length) setPath(path.slice(0, -1))
  }

  function renameCenter(value) {
    if (!path.length) {
      saveMindmap({ ...mm, root: value })
    } else {
      saveMindmap(updateNodeAtPath(mm, path, (nodes) => nodes.map((n) => ({ ...n, label: value }))))
    }
  }
  function renameChild(idx, value) {
    const childPath = [...path, idx]
    saveMindmap(updateNodeAtPath(mm, childPath, (nodes) => nodes.map((n) => ({ ...n, label: value }))))
  }
  function removeChild(idx) {
    if (!path.length) {
      saveMindmap({ ...mm, branches: mm.branches.filter((_, i) => i !== idx) })
    } else {
      saveMindmap(
        updateNodeAtPath(mm, path, (nodes) =>
          nodes.map((n) => ({ ...n, children: (n.children || []).filter((_, i) => i !== idx) })),
        ),
      )
    }
  }
  function addChild() {
    const newNode = { label: 'New branch', children: [] }
    if (!path.length) {
      saveMindmap({ ...mm, branches: [...mm.branches, newNode] })
    } else {
      saveMindmap(updateNodeAtPath(mm, path, (nodes) => nodes.map((n) => ({ ...n, children: [...(n.children || []), newNode] }))))
    }
  }

  const n = displayed.length || 1
  const R = Math.max(150, (n * 130) / (2 * Math.PI))
  const nodePositions = displayed.map((_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    return { x: R * Math.cos(angle), y: R * Math.sin(angle) }
  })
  const maxExtent = R + 100
  const W = maxExtent * 2
  const H = maxExtent * 2

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {path.length > 0 ? (
          <button onClick={collapseUp} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            <ArrowLeft size={14} /> Back up
          </button>
        ) : (
          <span />
        )}
        <button onClick={() => setEditing((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition ${editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          <Pencil size={12} /> {editing ? 'Done editing' : 'Edit'}
        </button>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minWidth: 420, maxWidth: 560 }}>
          <g transform={`translate(${maxExtent}, ${maxExtent})`}>
            {nodePositions.map((p, i) => (
              <line key={i} x1={0} y1={0} x2={p.x} y2={p.y} stroke="#cbd5e1" strokeWidth={1.5} />
            ))}
            <g onClick={collapseUp} style={{ cursor: path.length ? 'pointer' : 'default' }}>
              <circle cx={0} cy={0} r={52} fill="#2563eb" />
              <foreignObject x={-47} y={-28} width={94} height={56}>
                {editing ? (
                  <input
                    defaultValue={centerLabel}
                    onBlur={(e) => renameCenter(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full h-full bg-transparent text-white text-[11px] font-semibold text-center outline-none border-b border-white/40"
                  />
                ) : (
                  <div className="text-white text-[11px] font-semibold text-center leading-tight flex items-center justify-center h-full px-1">{centerLabel}</div>
                )}
              </foreignObject>
            </g>
            {displayed.map((node, i) => {
              const p = nodePositions[i]
              const w = Math.max(100, Math.min(220, textWidth(node.label, 11) + 36))
              const hasChildren = node.children?.length > 0
              return (
                <g key={i} transform={`translate(${p.x}, ${p.y})`}>
                  <g onClick={() => selectChild(i)} style={{ cursor: hasChildren && !editing ? 'pointer' : 'default' }}>
                    <rect x={-w / 2} y={-17} width={w} height={34} rx={17} fill={hasChildren ? '#dbeafe' : 'white'} stroke={hasChildren ? '#93c5fd' : '#e2e8f0'} />
                    <foreignObject x={-w / 2 + 4} y={-15} width={w - 8} height={30}>
                      {editing ? (
                        <input defaultValue={node.label} onBlur={(e) => renameChild(i, e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full h-full bg-transparent text-[10px] font-semibold text-blue-900 text-center outline-none" />
                      ) : (
                        <div className="text-[10px] font-semibold text-blue-900 text-center leading-tight flex items-center justify-center h-full">{node.label}</div>
                      )}
                    </foreignObject>
                  </g>
                  {editing && (
                    <g onClick={() => removeChild(i)} style={{ cursor: 'pointer' }} transform={`translate(${w / 2 - 4}, -20)`}>
                      <circle r={8} fill="#fee2e2" />
                      <text textAnchor="middle" dy={3} fontSize="9" fill="#dc2626">
                        ×
                      </text>
                    </g>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      </div>
      {editing && (
        <button onClick={addChild} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-3">
          <Plus size={14} /> Add branch here
        </button>
      )}
      {!editing && displayed.some((d) => d.children?.length) && <p className="text-xs text-slate-400 mt-3">Click a highlighted branch to expand it.</p>}
    </div>
  )
}

// ---------- Timeline ----------
function TimelineView({ notebook, onSave }) {
  const items = notebook.specials?.timeline || []
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(items)

  if (!items.length) return <p className="text-slate-400">No timeline available for this material.</p>

  function startEdit() {
    setDraft(items.map((it) => ({ ...it })))
    setEditing(true)
  }
  function save() {
    onSave({ ...notebook, specials: { ...notebook.specials, timeline: draft } })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 max-w-2xl">
        <div className="space-y-2.5">
          {draft.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={it.date} onChange={(e) => setDraft((d) => d.map((x, idx) => (idx === i ? { ...x, date: e.target.value } : x)))} className={`${inputClass} w-32 shrink-0`} placeholder="Date" />
              <input value={it.event} onChange={(e) => setDraft((d) => d.map((x, idx) => (idx === i ? { ...x, event: e.target.value } : x)))} className={inputClass} placeholder="Event" />
              <button onClick={() => setDraft((d) => d.filter((_, idx) => idx !== i))} className="w-8 h-8 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center transition shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setDraft((d) => [...d, { date: '', event: '' }])} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-3">
          <Plus size={14} /> Add event
        </button>
        <div className="flex gap-2 mt-5">
          <PrimaryButton onClick={save}>Save</PrimaryButton>
          <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
        </div>
      </div>
    )
  }

  return (
    <div className="relative group">
      <button onClick={startEdit} className="absolute top-3 right-3 z-10 flex items-center gap-1 text-xs font-medium bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-blue-600 hover:border-blue-200 rounded-full px-3 py-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
        <Pencil size={12} /> Edit
      </button>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 max-w-2xl">
        <div className="relative pl-6 border-l-2 border-blue-100 space-y-7">
          {items.map((it, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[29px] top-0.5 w-3.5 h-3.5 rounded-full bg-blue-600 ring-4 ring-blue-50" />
              <p className="text-xs font-semibold text-blue-600">{it.date}</p>
              <p className="text-slate-700 mt-0.5">{it.event}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Chart ----------
function ChartView({ notebook, onSave }) {
  const chart = notebook.specials?.chart
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(chart)

  if (!chart || !chart.data?.length) return <p className="text-slate-400">No solid quantitative data was found in this material to chart.</p>

  function startEdit() {
    setDraft({ ...chart, data: chart.data.map((d) => ({ ...d })) })
    setEditing(true)
  }
  function save() {
    onSave({ ...notebook, specials: { ...notebook.specials, chart: draft } })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 max-w-2xl">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input value={draft.title || ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={inputClass} placeholder="Chart title" />
          <input value={draft.caption || ''} onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))} className={inputClass} placeholder="Caption" />
          <input value={draft.xLabel || ''} onChange={(e) => setDraft((d) => ({ ...d, xLabel: e.target.value }))} className={inputClass} placeholder="X-axis label" />
          <input value={draft.yLabel || ''} onChange={(e) => setDraft((d) => ({ ...d, yLabel: e.target.value }))} className={inputClass} placeholder="Y-axis label (e.g. Years, Number of people)" />
        </div>
        <div className="space-y-2">
          {draft.data.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={row.label} onChange={(e) => setDraft((d) => ({ ...d, data: d.data.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)) }))} className={inputClass} placeholder="Label" />
              <input
                type="number"
                value={row.value}
                onChange={(e) => setDraft((d) => ({ ...d, data: d.data.map((x, idx) => (idx === i ? { ...x, value: Number(e.target.value) } : x)) }))}
                className={`${inputClass} w-28 shrink-0`}
                placeholder="Value"
              />
              <button onClick={() => setDraft((d) => ({ ...d, data: d.data.filter((_, idx) => idx !== i) }))} className="w-8 h-8 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center transition shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => setDraft((d) => ({ ...d, data: [...d.data, { label: '', value: 0 }] }))} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mt-3">
          <Plus size={14} /> Add row
        </button>
        <div className="flex gap-2 mt-5">
          <PrimaryButton onClick={save}>Save</PrimaryButton>
          <SecondaryButton onClick={() => setEditing(false)}>Cancel</SecondaryButton>
        </div>
      </div>
    )
  }

  const max = Math.max(...chart.data.map((d) => d.value), 1)
  return (
    <div className="relative group">
      <button onClick={startEdit} className="absolute top-3 right-3 z-10 flex items-center gap-1 text-xs font-medium bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-blue-600 hover:border-blue-200 rounded-full px-3 py-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
        <Pencil size={12} /> Edit
      </button>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 max-w-2xl">
        <p className="font-medium text-slate-900">{chart.title}</p>
        {chart.caption && <p className="text-xs text-slate-400 mt-1">{chart.caption}</p>}
        {(chart.xLabel || chart.yLabel) && (
          <p className="text-xs text-slate-400 mt-0.5">
            {chart.xLabel && <span>x-axis: {chart.xLabel}</span>}
            {chart.xLabel && chart.yLabel && ' · '}
            {chart.yLabel && <span>y-axis: {chart.yLabel}</span>}
          </p>
        )}
        <div className="space-y-3 mt-6">
          {chart.data.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="w-28 text-sm text-slate-600 text-right shrink-0 truncate">{d.label}</span>
              <div className="flex-1 h-6 bg-slate-100 rounded-md overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-md flex items-center justify-end pr-2 transition-all" style={{ width: `${Math.max(6, (d.value / max) * 100)}%` }}>
                  <span className="text-white text-[10px] font-semibold">{d.value}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Graphs & Images ----------
function GraphsSection({ notebook, apiKey, onNeedApiKey, onSave }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const graphs = notebook.specials?.graphs || []
  const images = notebook.specials?.graphImages || []
  const exists = !!notebook.specials?.graphs

  async function generate() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      setProgress('Planning diagrams…')
      const data = await generateLazySpecial({ apiKey, notebook, kind: 'graphs' })
      const prompts = (data.graphImagePrompts || []).slice(0, 3)
      const generatedImages = []
      const failures = []
      for (let i = 0; i < prompts.length; i++) {
        setProgress(`Generating illustration ${i + 1} of ${prompts.length}…`)
        try {
          const raw = await generateIllustration({ apiKey, prompt: prompts[i].prompt })
          const small = await downscaleDataUrl(raw, 800, 0.72).catch(() => raw)
          generatedImages.push({ caption: prompts[i].caption, dataUrl: small })
        } catch (e) {
          failures.push(e.message)
        }
      }
      onSave({ ...notebook, specials: { ...(notebook.specials || {}), graphs: data.graphs || [], graphImages: generatedImages } })
      if (prompts.length && failures.length) setError(`${generatedImages.length} of ${prompts.length} illustrations generated — ${failures.length} failed (${failures[0]}).`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  function saveGraphs(nextGraphs) {
    onSave({ ...notebook, specials: { ...notebook.specials, graphs: nextGraphs } })
  }
  function saveImages(nextImages) {
    onSave({ ...notebook, specials: { ...notebook.specials, graphImages: nextImages } })
  }

  if (!exists) {
    return (
      <EmptyHint
        icon={Sparkles}
        title="Not generated yet"
        body="This builds flow diagrams and a couple of illustrations on demand, so it's only generated when you actually want it."
        action={
          <div>
            <PrimaryButton onClick={generate} busy={busy}>
              {busy ? progress || 'Generating…' : 'Generate'}
            </PrimaryButton>
            {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
          </div>
        }
      />
    )
  }

  if (!graphs.length && !images.length) return <p className="text-slate-400">No diagrams available for this material.</p>

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition ${editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          <Pencil size={12} /> {editing ? 'Done editing' : 'Edit'}
        </button>
      </div>
      {error && <p className="text-xs text-amber-600 mb-3">{error}</p>}
      <div className="space-y-6">
        {graphs.map((g, gi) => (
          <div key={`flow-${gi}`} className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8">
            {editing ? (
              <input defaultValue={g.title} onBlur={(e) => saveGraphs(graphs.map((x, i) => (i === gi ? { ...x, title: e.target.value } : x)))} className={`${inputClass} font-medium mb-4`} />
            ) : (
              <p className="font-medium text-slate-900">{g.title}</p>
            )}
            {g.caption && !editing && <p className="text-xs text-slate-400 mt-1 mb-5">{g.caption}</p>}
            {g.kind === 'flow' && (
              <div className="flex flex-col items-center max-w-sm mx-auto">
                {(g.steps || []).map((s, si) => (
                  <div key={si} className="flex flex-col items-center w-full">
                    <div className="w-full flex items-center gap-1.5">
                      {editing ? (
                        <>
                          <input
                            defaultValue={s}
                            onBlur={(e) => saveGraphs(graphs.map((x, i) => (i === gi ? { ...x, steps: x.steps.map((st, j) => (j === si ? e.target.value : st)) } : x)))}
                            className={`${inputClass} text-sm text-center`}
                          />
                          <button onClick={() => saveGraphs(graphs.map((x, i) => (i === gi ? { ...x, steps: x.steps.filter((_, j) => j !== si) } : x)))} className="w-7 h-7 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center shrink-0">
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : (
                        <div className="w-full text-center px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-100 text-sm font-medium text-blue-800">{s}</div>
                      )}
                    </div>
                    {si < g.steps.length - 1 && <ArrowDown size={16} className="text-slate-300 my-1.5 shrink-0" />}
                  </div>
                ))}
                {editing && (
                  <button onClick={() => saveGraphs(graphs.map((x, i) => (i === gi ? { ...x, steps: [...x.steps, 'New step'] } : x)))} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline mt-2">
                    <Plus size={12} /> Add step
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
          {images.map((img, i) => (
            <figure key={`img-${i}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden relative">
              {editing && (
                <button onClick={() => saveImages(images.filter((_, idx) => idx !== i))} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 hover:bg-rose-50 text-slate-400 hover:text-rose-500 flex items-center justify-center transition">
                  <Trash2 size={13} />
                </button>
              )}
              <img src={img.dataUrl} alt={img.caption || 'Illustration'} className="w-full h-48 object-cover" />
              {editing ? (
                <input defaultValue={img.caption} onBlur={(e) => saveImages(images.map((x, idx) => (idx === i ? { ...x, caption: e.target.value } : x)))} className={`${inputClass} m-3 w-[calc(100%-1.5rem)]`} />
              ) : (
                img.caption && <figcaption className="text-sm text-slate-600 px-4 py-3">{img.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      {!busy && (
        <button onClick={generate} className="text-xs text-blue-600 hover:underline mt-4">
          Regenerate
        </button>
      )}
    </div>
  )
}

// ---------- Custom special ----------
function CustomSpecialModal({ notebook, apiKey, onNeedApiKey, onClose, onCreated }) {
  const [type, setType] = useState('slidedeck')
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function generate() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await generateCustomSpecial({ apiKey, notebook, type, focus })
      onCreated({ id: uid('custom'), type, label: CUSTOM_TYPES.find((t) => t.id === type)?.label, focus, data, createdAt: Date.now() })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Create something custom" onClose={onClose} wide>
      <p className="text-sm text-slate-500 mb-4">Pick a format, optionally tell it what to focus on, and only this gets generated.</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {CUSTOM_TYPES.map((t) => (
          <button key={t.id} onClick={() => setType(t.id)} className={`text-sm font-medium px-3 py-2.5 rounded-xl border transition ${type === t.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        <Field label={type === 'custom' ? 'Describe what you want' : 'Focus on (optional)'} hint={type === 'custom' ? 'e.g. "A one-page cheat sheet of every formula with a worked example each."' : 'e.g. "Just the causes" or "Focus on vocabulary"'}>
          <textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder={type === 'custom' ? 'What should this be?' : 'Leave blank to cover everything'} />
        </Field>
      </div>
      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
      <div className="flex gap-2 mt-5">
        <SecondaryButton onClick={onClose} className="flex-1">
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={generate} busy={busy} disabled={type === 'custom' && !focus.trim()} className="flex-1">
          Generate
        </PrimaryButton>
      </div>
    </Modal>
  )
}

function CustomSpecialView({ item, notebook, onChange }) {
  if (item.type === 'slidedeck') return <SlideDeckView data={item.data} onChange={onChange} notebook={notebook} />
  if (item.type === 'flashcards') return <FlashcardDeckView data={item.data} onChange={onChange} />
  if (item.type === 'infographic') return <InfographicView data={item.data} onChange={onChange} />
  return <ReportView data={item.data} onChange={onChange} />
}

const SUBJECT_THEMES = {
  science: { bg: 'from-emerald-600 to-teal-700', corner1: '🧪', corner2: '⚛️' },
  math: { bg: 'from-indigo-600 to-blue-700', corner1: '📐', corner2: '∑' },
  history: { bg: 'from-amber-700 to-orange-800', corner1: '🏛️', corner2: '📜' },
  government: { bg: 'from-slate-700 to-blue-900', corner1: '⚖️', corner2: '🏛️' },
  literature: { bg: 'from-rose-600 to-pink-700', corner1: '📖', corner2: '🖋️' },
  arts: { bg: 'from-fuchsia-600 to-purple-700', corner1: '🎨', corner2: '🎭' },
  default: { bg: 'from-blue-600 to-cyan-500', corner1: '', corner2: '' },
}

function SlideDeckView({ data, onChange, notebook }) {
  const [i, setI] = useState(0)
  const [editing, setEditing] = useState(false)
  const slides = data.slides || []
  if (!slides.length) return <p className="text-slate-400">No slides generated.</p>
  const slide = slides[i]
  const theme = SUBJECT_THEMES[inferSubjectTheme(notebook)] || SUBJECT_THEMES.default

  function updateSlide(patch) {
    onChange({ ...data, slides: slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-end mb-2">
        <button onClick={() => setEditing((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition ${editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          <Pencil size={12} /> {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className={`relative overflow-hidden bg-gradient-to-br ${theme.bg} text-white rounded-2xl p-10 aspect-video flex flex-col justify-center`}>
        <span className="absolute -top-2 -left-2 text-6xl opacity-10">{theme.corner1}</span>
        <span className="absolute -bottom-4 -right-4 text-7xl opacity-10">{theme.corner2}</span>
        {editing ? (
          <input defaultValue={slide.title} onBlur={(e) => updateSlide({ title: e.target.value })} className="relative text-2xl font-display font-semibold mb-4 bg-white/10 rounded-lg px-2 py-1 outline-none" />
        ) : (
          <p className="relative text-2xl font-display font-semibold mb-4">{slide.title}</p>
        )}
        <ul className="relative space-y-2">
          {(slide.bullets || []).map((b, j) => (
            <li key={j} className="text-blue-50 flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />
              {editing ? (
                <input defaultValue={b} onBlur={(e) => updateSlide({ bullets: slide.bullets.map((x, k) => (k === j ? e.target.value : x)) })} className="flex-1 bg-white/10 rounded px-1.5 py-0.5 outline-none" />
              ) : (
                b
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between mt-4">
        <SecondaryButton onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
          <ChevronLeft size={15} /> Prev
        </SecondaryButton>
        <span className="text-sm text-slate-400">
          Slide {i + 1} of {slides.length}
        </span>
        <SecondaryButton onClick={() => setI((v) => Math.min(slides.length - 1, v + 1))} disabled={i >= slides.length - 1}>
          Next <ChevronRight size={15} />
        </SecondaryButton>
      </div>
    </div>
  )
}

function FlashcardDeckView({ data, onChange }) {
  const cards = data.cards || []
  const [flipped, setFlipped] = useState({})
  const [editing, setEditing] = useState(false)
  const [browseIndex, setBrowseIndex] = useState(null)
  if (!cards.length) return <p className="text-slate-400">No flashcards generated.</p>

  function updateCard(i, patch) {
    onChange({ ...data, cards: cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) })
  }
  function removeCard(i) {
    onChange({ ...data, cards: cards.filter((_, idx) => idx !== i) })
  }

  if (browseIndex !== null) {
    const card = cards[browseIndex]
    return (
      <div className="max-w-md mx-auto">
        <button onClick={() => setBrowseIndex(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={14} /> Back to grid
        </button>
        <button onClick={() => setFlipped((f) => ({ ...f, browse: !f.browse }))} className={`w-full min-h-[220px] rounded-2xl border p-8 flex items-center justify-center text-center transition ${flipped.browse ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
          <p className={flipped.browse ? 'text-lg text-blue-900' : 'font-display text-xl font-semibold text-slate-900'}>{flipped.browse ? card.definition : card.term}</p>
        </button>
        <p className="text-center text-xs text-slate-400 mt-2">Click the card to flip it</p>
        <div className="flex items-center justify-between mt-4">
          <SecondaryButton
            onClick={() => {
              setBrowseIndex((v) => Math.max(0, v - 1))
              setFlipped((f) => ({ ...f, browse: false }))
            }}
            disabled={browseIndex === 0}
          >
            <ChevronLeft size={15} /> Prev
          </SecondaryButton>
          <span className="text-sm text-slate-400">
            {browseIndex + 1} of {cards.length}
          </span>
          <SecondaryButton
            onClick={() => {
              setBrowseIndex((v) => Math.min(cards.length - 1, v + 1))
              setFlipped((f) => ({ ...f, browse: false }))
            }}
            disabled={browseIndex >= cards.length - 1}
          >
            Next <ChevronRight size={15} />
          </SecondaryButton>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <PrimaryButton onClick={() => setBrowseIndex(0)}>Go through all cards</PrimaryButton>
        <button onClick={() => setEditing((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition ${editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          <Pencil size={12} /> {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c, i) =>
          editing ? (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5 relative">
              <button onClick={() => removeCard(i)} className="absolute top-2 right-2 w-6 h-6 rounded-full hover:bg-rose-50 text-slate-300 hover:text-rose-500 flex items-center justify-center">
                <XIcon size={12} />
              </button>
              <input defaultValue={c.term} onBlur={(e) => updateCard(i, { term: e.target.value })} className={`${inputClass} font-medium`} />
              <textarea defaultValue={c.definition} onBlur={(e) => updateCard(i, { definition: e.target.value })} rows={2} className={`${inputClass} text-sm resize-none`} />
            </div>
          ) : (
            <button key={i} onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))} className={`text-left rounded-2xl border p-5 min-h-[120px] flex items-center transition ${flipped[i] ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
              <p className={flipped[i] ? 'text-sm text-blue-900' : 'font-display font-semibold text-slate-900'}>{flipped[i] ? c.definition : c.term}</p>
            </button>
          ),
        )}
      </div>
    </div>
  )
}

function InfographicView({ data, onChange }) {
  const [editing, setEditing] = useState(false)
  const stats = data.stats || []
  const highlights = data.highlights || []

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 max-w-3xl">
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition ${editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          <Pencil size={12} /> {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="text-center bg-blue-50 rounded-xl p-4">
            {editing ? (
              <>
                <input defaultValue={s.value} onBlur={(e) => onChange({ ...data, stats: stats.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)) })} className="w-full text-center font-display text-lg font-bold text-blue-700 bg-transparent outline-none" />
                <input defaultValue={s.label} onBlur={(e) => onChange({ ...data, stats: stats.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)) })} className="w-full text-center text-xs text-slate-500 bg-transparent outline-none mt-1" />
              </>
            ) : (
              <>
                <p className="font-display text-2xl font-bold text-blue-700">{s.value}</p>
                <p className="text-xs text-slate-500 mt-1">{s.label}</p>
              </>
            )}
          </div>
        ))}
      </div>
      {highlights.length > 0 && (
        <ul className="mt-6 space-y-2">
          {highlights.map((h, i) => (
            <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              {editing ? <input defaultValue={h} onBlur={(e) => onChange({ ...data, highlights: highlights.map((x, idx) => (idx === i ? e.target.value : x)) })} className={`${inputClass} flex-1`} /> : h}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReportView({ data, onChange }) {
  const [editing, setEditing] = useState(false)
  const sections = data.sections || []

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 max-w-3xl">
      <div className="flex justify-end mb-3">
        <button onClick={() => setEditing((v) => !v)} className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition ${editing ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
          <Pencil size={12} /> {editing ? 'Done' : 'Edit'}
        </button>
      </div>
      {sections.map((s, i) => (
        <div key={i} className={i > 0 ? 'mt-6' : ''}>
          {editing ? (
            <input
              defaultValue={s.heading}
              onBlur={(e) => onChange({ ...data, sections: sections.map((x, idx) => (idx === i ? { ...x, heading: e.target.value } : x)) })}
              className={`${inputClass} font-display font-semibold text-lg`}
            />
          ) : (
            <p className="font-display font-semibold text-slate-900 text-lg">{s.heading}</p>
          )}
          {(s.paragraphs || []).map((p, j) =>
            editing ? (
              <textarea
                key={j}
                defaultValue={p}
                onBlur={(e) => onChange({ ...data, sections: sections.map((x, idx) => (idx === i ? { ...x, paragraphs: x.paragraphs.map((pp, k) => (k === j ? e.target.value : pp)) } : x)) })}
                rows={3}
                className={`${inputClass} mt-2 resize-none`}
              />
            ) : (
              <p key={j} className="text-slate-600 leading-relaxed mt-2">
                {p}
              </p>
            ),
          )}
        </div>
      ))}
    </div>
  )
}
