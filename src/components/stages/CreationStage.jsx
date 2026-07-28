import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Image as ImageIcon, Presentation, BookOpen as BookIcon, File as FileIcon, Video, Music, Camera, Globe, PlayCircle, Link2, Pencil, X, Sparkles, Folder as FolderIcon, Type, Check, AlertCircle, Eye, Settings2 } from 'lucide-react'
import { processUploadedFile, pastedTextSource, downscaleDataUrl } from '../../lib/fileParsing'
import { generateTopicPlan, generateLecture, generatePractice, transcribeMediaFile } from '../../lib/gemini'
import { uid, defaultStageEnabled } from '../../lib/storage'
import { PrimaryButton, SecondaryButton, Modal, Field, inputClass, Spinner } from '../ui.jsx'

const KIND_ICON = { slides: Presentation, pdf: BookIcon, image: ImageIcon, video: Video, audio: Music, website: Globe, youtube: PlayCircle, text: FileText, doc: FileText, other: FileIcon }
const UPLOAD_ACCEPT = '.pdf,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,.ppt,.pptx,.doc,.docx,.mp4,.mov,.webm,.mkv,.mp3,.wav,.m4a,.ogg,.aac'
const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)/i

export default function CreationStage({ notebook, onSave, apiKey, onNeedApiKey, onGenerated }) {
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [viewingSource, setViewingSource] = useState(null)
  const [folderDraft, setFolderDraft] = useState(notebook.folder || '')
  const [selection, setSelection] = useState(() => notebook.stageEnabled || defaultStageEnabled())
  const fileInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const audioInputRef = useRef(null)
  // Raw File objects for media awaiting transcription (kept in memory only — never persisted).
  const rawFileCacheRef = useRef(new Map())
  // Tracks the freshest notebook value synchronously, so background transcription and other
  // edits (which can interleave across awaits) never clobber each other with a stale copy.
  const notebookRef = useRef(notebook)
  useEffect(() => {
    notebookRef.current = notebook
  }, [notebook])

  function patchNotebook(updater) {
    const next = typeof updater === 'function' ? updater(notebookRef.current) : updater
    notebookRef.current = next
    onSave(next)
    return next
  }

  async function addFiles(fileList) {
    setError('')
    const files = Array.from(fileList || [])
    if (!files.length) return
    const processed = []
    for (const f of files) {
      try {
        const src = await processUploadedFile(f)
        const id = uid('src')
        const { videoDataUrl, audioDataUrl, ...lightweight } = src
        if (src.kind === 'video' || src.kind === 'audio') {
          rawFileCacheRef.current.set(id, f)
          lightweight.hasMedia = true
        }
        processed.push({ id, ...lightweight })
      } catch (e) {
        console.error(e)
      }
    }
    if (!processed.length) return
    patchNotebook((prev) => ({ ...prev, sources: [...prev.sources, ...processed] }))
    // If we already have a key, transcribe media in the background right away — this is what
    // makes video/audio a real, reusable text source instead of dead weight.
    if (apiKey) {
      for (const p of processed) {
        if (p.hasMedia) transcribeInBackground(p.id)
      }
    }
  }

  async function transcribeInBackground(sourceId) {
    const file = rawFileCacheRef.current.get(sourceId)
    if (!file || !apiKey) return
    updateSourceMeta(sourceId, { meta: 'Transcribing…', transcribing: true })
    try {
      const transcript = await transcribeMediaFile({ apiKey, file })
      updateSourceMeta(sourceId, { textContent: transcript, meta: `Transcript · ${transcript.split(/\s+/).length} words`, transcribing: false, hasMedia: false })
      rawFileCacheRef.current.delete(sourceId)
    } catch (e) {
      updateSourceMeta(sourceId, { meta: `Could not be transcribed — not indexed (${e.message})`, transcribing: false })
    }
  }

  function updateSourceMeta(sourceId, patch) {
    patchNotebook((prev) => ({ ...prev, sources: prev.sources.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)) }))
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  function removeSource(id) {
    rawFileCacheRef.current.delete(id)
    patchNotebook((prev) => ({ ...prev, sources: prev.sources.filter((s) => s.id !== id) }))
  }

  function renameSource(id, name) {
    patchNotebook((prev) => ({ ...prev, sources: prev.sources.map((s) => (s.id === id ? { ...s, name } : s)) }))
  }

  function addPastedText(text, label) {
    if (!text.trim()) return
    patchNotebook((prev) => ({ ...prev, sources: [...prev.sources, { id: uid('src'), ...pastedTextSource(text, label || 'Pasted text') }] }))
    setShowPaste(false)
  }

  function addLink(url) {
    const isYoutube = YOUTUBE_RE.test(url)
    const source = isYoutube
      ? { name: 'YouTube video', kind: 'youtube', url, meta: url }
      : { name: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), kind: 'website', url, meta: 'Website — read live when you generate' }
    patchNotebook((prev) => ({ ...prev, sources: [...prev.sources, { id: uid('src'), textContent: null, imageDataUrl: null, ...source }] }))
    setShowLink(false)
  }

  function addCameraPhoto(dataUrl) {
    downscaleDataUrl(dataUrl, 1400, 0.8)
      .then((small) => {
        patchNotebook((prev) => ({ ...prev, sources: [...prev.sources, { id: uid('src'), name: `Photo ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, kind: 'image', meta: 'Photo', textContent: null, imageDataUrl: small }] }))
      })
      .catch(() => setError('Could not process that photo — try again.'))
    setShowCamera(false)
  }

  function commitFolder() {
    patchNotebook((prev) => ({ ...prev, folder: folderDraft.trim() || null }))
  }

  async function handleGenerate() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      // Any media still waiting on a key gets transcribed first so it's real text for planning.
      const pendingMedia = notebookRef.current.sources.filter((s) => s.hasMedia && rawFileCacheRef.current.has(s.id))
      for (const s of pendingMedia) {
        setProgress(`Transcribing ${s.name}…`)
        await transcribeInBackground(s.id)
      }
      const latestSources = notebookRef.current.sources

      setProgress('Planning your notebook…')
      const plan = await generateTopicPlan({ apiKey, title: notebook.title, sources: latestSources })

      const updates = {
        topics: plan.topics,
        description: notebook.description || plan.topics.slice(0, 3).join(', '),
        generated: true,
        stageEnabled: selection,
        notes: selection.notes ? { topics: plan.noteTopics.map((t) => ({ id: uid('topic'), title: t.title, mainIdea: t.mainIdea, detailed: null })), reviewPrompts: plan.reviewPrompts } : null,
      }

      if (selection.lecture) {
        setProgress('Writing your lecture…')
        const lectureData = await generateLecture({ apiKey, title: notebook.title, sources: latestSources, noteTopics: plan.noteTopics })
        updates.lecture = lectureData
      }
      if (selection.practice) {
        setProgress('Building your practice set…')
        const practiceData = await generatePractice({ apiKey, title: notebook.title, sources: latestSources })
        updates.practice = practiceData
      }

      patchNotebook((prev) => ({ ...prev, ...updates }))
      onGenerated()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const hasUsableSource = notebook.sources.some((s) => s.textContent || s.imageDataUrl || s.audioDataUrl || s.url || s.hasMedia)
  const viewableSource = notebook.sources.find((s) => s.id === viewingSource)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <h2 className="font-display text-2xl font-semibold text-slate-900">Add your materials</h2>
        <p className="text-slate-500 mt-1">Drop anything: slides, PDFs, photos, video, audio, links, or your own text.</p>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-6 border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition ${dragOver ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
        >
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} accept={UPLOAD_ACCEPT} />
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Upload size={22} />
          </div>
          <p className="font-medium text-slate-900 mt-4">Drag files here or click to upload</p>
          <p className="text-sm text-slate-400 mt-1">Presentations, images, PDFs, video, audio, textbooks</p>
          <div className="flex items-center justify-center gap-3 mt-4 text-slate-400">
            <Presentation size={18} />
            <ImageIcon size={18} />
            <FileText size={18} />
            <BookIcon size={18} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <QuickAction icon={Type} label="Paste text" onClick={() => setShowPaste(true)} />
          <QuickAction icon={Link2} label="Add link / YouTube" onClick={() => setShowLink(true)} />
          <QuickAction icon={Camera} label="Take a photo" onClick={() => setShowCamera(true)} />
          <QuickAction icon={Video} label="Add video" onClick={() => videoInputRef.current?.click()} />
          <QuickAction icon={Music} label="Add audio" onClick={() => audioInputRef.current?.click()} />
        </div>
        <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => addFiles(e.target.files)} />

        <h3 className="font-display font-semibold text-slate-900 mt-8 mb-3">Sources in this notebook</h3>
        {notebook.sources.length === 0 ? (
          <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl p-6 text-center">No sources yet — add something above.</p>
        ) : (
          <div className="space-y-2.5">
            {notebook.sources.map((s) => (
              <SourceRow key={s.id} source={s} onRemove={() => removeSource(s.id)} onRename={(name) => renameSource(s.id, name)} onView={s.textContent ? () => setViewingSource(s.id) : null} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase flex items-center gap-1.5 mb-3">
            <FolderIcon size={13} /> Folder
          </p>
          <input value={folderDraft} onChange={(e) => setFolderDraft(e.target.value)} onBlur={commitFolder} placeholder="No folder" className={inputClass} />
          <p className="text-xs text-slate-400 mt-2">Group this notebook with others for the same class.</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 rounded-2xl p-5 relative">
          <button onClick={() => setShowCustomize(true)} title="Customize what generates" className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/70 hover:bg-white text-blue-700 flex items-center justify-center transition">
            <Settings2 size={15} />
          </button>
          <Sparkles size={18} className="text-blue-600" />
          <p className="font-display font-semibold text-slate-900 mt-3">Ready to learn?</p>
          <p className="text-sm text-slate-600 mt-1">
            {notebook.sources.length === 0
              ? 'Add a source above to get started.'
              : hasUsableSource
              ? `We'll read ${notebook.sources.length} source${notebook.sources.length === 1 ? '' : 's'} and generate what you've selected below.`
              : 'Add at least one source with real content (paste, .txt, PDF, image, link, or audio/video) before generating.'}
          </p>
          {busy && (
            <p className="text-sm text-blue-700 mt-3 flex items-center gap-2">
              <Spinner size={14} /> {progress || 'Working…'}
            </p>
          )}
          {error && (
            <p className="text-sm text-rose-600 mt-3 flex items-start gap-1.5">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <PrimaryButton onClick={handleGenerate} busy={busy} disabled={busy || !hasUsableSource} className="w-full mt-4">
            {notebook.generated ? 'Regenerate study materials' : 'Generate study materials'}
          </PrimaryButton>
          {!apiKey && <p className="text-xs text-slate-500 mt-2 text-center">You'll be asked for a free Gemini API key.</p>}
        </div>

        {notebook.topics?.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase mb-3">Detected topics</p>
            <div className="flex flex-wrap gap-2">
              {notebook.topics.map((t) => (
                <span key={t} className="text-xs font-medium bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showPaste && <PasteModal onClose={() => setShowPaste(false)} onAdd={addPastedText} />}
      {showLink && <LinkModal onClose={() => setShowLink(false)} onAdd={addLink} />}
      {showCamera && <CameraModal onClose={() => setShowCamera(false)} onCapture={addCameraPhoto} />}
      {showCustomize && <CustomizeModal selection={selection} onChange={setSelection} onClose={() => setShowCustomize(false)} />}
      {viewableSource && <ViewSourceModal source={viewableSource} onClose={() => setViewingSource(null)} />}
    </div>
  )
}

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl px-3.5 py-2 transition">
      <Icon size={14} /> {label}
    </button>
  )
}

function SourceRow({ source: s, onRemove, onRename, onView }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.name)
  const Icon = KIND_ICON[s.kind] || FileIcon
  const usable = !!(s.textContent || s.imageDataUrl || s.audioDataUrl || s.url || s.hasMedia)

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== s.name) onRename(trimmed)
    else setDraft(s.name)
  }

  return (
    <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
        {s.transcribing ? <Spinner size={15} /> : <Icon size={16} />}
      </div>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(s.name)
                setEditing(false)
              }
            }}
            className="text-sm font-medium text-slate-900 border border-blue-300 rounded-lg px-2 py-1 w-full outline-none"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="group/rename flex items-center gap-1.5 text-left max-w-full">
            <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
            <Pencil size={11} className="text-slate-300 group-hover/rename:text-slate-500 shrink-0 transition" />
          </button>
        )}
        <p className="text-xs text-slate-400 truncate">{s.meta}</p>
      </div>
      {onView && (
        <button onClick={onView} title="View content" className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition shrink-0">
          <Eye size={14} />
        </button>
      )}
      {usable ? (
        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 shrink-0">
          <Check size={13} /> Indexed
        </span>
      ) : (
        <span className="text-xs font-medium text-amber-600 shrink-0">Add text</span>
      )}
      <button onClick={onRemove} className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition shrink-0">
        <X size={14} />
      </button>
    </div>
  )
}

function ViewSourceModal({ source, onClose }) {
  return (
    <Modal title={source.name} onClose={onClose} wide>
      <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto">{source.textContent}</pre>
    </Modal>
  )
}

function PasteModal({ onClose, onAdd }) {
  const [label, setLabel] = useState('')
  const [text, setText] = useState('')
  return (
    <Modal title="Paste text" onClose={onClose} wide>
      <div className="space-y-4">
        <Field label="Label (optional)">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Chapter 7 notes" className={inputClass} />
        </Field>
        <Field label="Text">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder="Paste your notes, textbook excerpt, or anything else you want Noted to study from…" className={`${inputClass} resize-none`} />
        </Field>
        <div className="flex gap-2">
          <SecondaryButton onClick={onClose} className="flex-1">
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={() => onAdd(text, label)} disabled={!text.trim()} className="flex-1">
            Add to notebook
          </PrimaryButton>
        </div>
      </div>
    </Modal>
  )
}

function LinkModal({ onClose, onAdd }) {
  const [url, setUrl] = useState('')
  const isYoutube = YOUTUBE_RE.test(url)
  return (
    <Modal title="Add a link" onClose={onClose}>
      <Field label="Website or YouTube URL">
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputClass} />
      </Field>
      <p className="text-xs text-slate-400 mt-2">{url.trim() ? (isYoutube ? "We'll use this YouTube video directly when you generate." : "We'll read this page's content when you generate.") : 'Paste a webpage or YouTube link.'}</p>
      <div className="flex gap-2 mt-5">
        <SecondaryButton onClick={onClose} className="flex-1">
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={() => onAdd(url.trim())} disabled={!url.trim()} className="flex-1">
          Add to notebook
        </PrimaryButton>
      </div>
    </Modal>
  )
}

function CameraModal({ onClose, onCapture }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access your camera — upload a photo file instead.")
      return undefined
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setReady(true)
        }
      })
      .catch(() => setError("Couldn't access your camera — check your browser's permission settings, or upload a photo file instead."))
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    onCapture(canvas.toDataURL('image/jpeg', 0.85))
  }

  return (
    <Modal title="Take a photo" onClose={onClose} wide>
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : (
        <div>
          <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-slate-900 aspect-video object-cover" />
          <PrimaryButton onClick={capture} disabled={!ready} className="w-full mt-4">
            <Camera size={16} /> Capture
          </PrimaryButton>
        </div>
      )}
    </Modal>
  )
}

const STAGE_LABELS = { practice: 'Practice', chat: 'Chat', teach: 'Teach' }
const LEARNING_SUB_LABELS = { lecture: 'Video Lecture', notes: 'Notes', specials: 'Specials' }

function CustomizeModal({ selection, onChange, onClose }) {
  const learningKeys = ['lecture', 'notes', 'specials']
  const learningAllChecked = learningKeys.every((k) => selection[k])
  const learningSomeChecked = learningKeys.some((k) => selection[k])

  function toggle(key) {
    onChange({ ...selection, [key]: !selection[key] })
  }
  function toggleLearningAll() {
    const next = !learningAllChecked
    onChange({ ...selection, lecture: next, notes: next, specials: next })
  }

  return (
    <Modal title="Customize what generates" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">Skip stages you don't need — you can always enable them later from inside the notebook.</p>
      <div className="space-y-1">
        <label className="flex items-center gap-2.5 py-2 cursor-pointer">
          <input type="checkbox" checked={learningAllChecked} ref={(el) => el && (el.indeterminate = learningSomeChecked && !learningAllChecked)} onChange={toggleLearningAll} className="w-4 h-4 rounded accent-blue-600" />
          <span className="text-sm font-medium text-slate-900">Learning</span>
        </label>
        <div className="ml-7 space-y-1 border-l border-slate-100 pl-4">
          {learningKeys.map((k) => (
            <label key={k} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
              <input type="checkbox" checked={!!selection[k]} onChange={() => toggle(k)} className="w-4 h-4 rounded accent-blue-600" />
              <span className="text-sm text-slate-700">{LEARNING_SUB_LABELS[k]}</span>
            </label>
          ))}
        </div>
        {Object.keys(STAGE_LABELS).map((k) => (
          <label key={k} className="flex items-center gap-2.5 py-2 cursor-pointer">
            <input type="checkbox" checked={!!selection[k]} onChange={() => toggle(k)} className="w-4 h-4 rounded accent-blue-600" />
            <span className="text-sm font-medium text-slate-900">{STAGE_LABELS[k]}</span>
          </label>
        ))}
      </div>
      <PrimaryButton onClick={onClose} className="w-full mt-5">
        Done
      </PrimaryButton>
    </Modal>
  )
}
