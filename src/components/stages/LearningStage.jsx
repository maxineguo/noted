import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Play, Pause, Volume2, ListChecks, Sparkles, Info, Maximize, Minimize, Check, Circle } from 'lucide-react'
import { LecturePlayer, computeLectureTiming, isTTSSupported } from '../../lib/speech'
import { AudioLecturePlayer } from '../../lib/geminiTTS'
import { generateLectureImagePrompts, generateIllustration, generateLecture, generateTopicPlan, generateTopicNotes } from '../../lib/gemini'
import { downscaleDataUrl } from '../../lib/fileParsing'
import { renderMarkdown } from '../../lib/markdown'
import { uid } from '../../lib/storage'
import { EmptyHint, EditableText, Spinner, PrimaryButton, StageGate } from '../ui.jsx'
import Specials from './Specials.jsx'

const TABS = ['Video lecture', 'Notes', 'Specials']
const RATES = [0.75, 1, 1.25, 1.5, 2]
const CONTROLS_HIDE_MS = 2800

const ANIMATION_KEYWORDS = [
  { keywords: ['erupt', 'explosion', 'explode', 'blast', 'bomb'], effect: 'effect-burst' },
  { keywords: ['invade', 'invasion', 'attack', 'war', 'battle', 'conflict', 'fight'], effect: 'effect-shake' },
  { keywords: ['grow', 'growth', 'expand', 'rise', 'increase', 'boom', 'flourish'], effect: 'effect-grow' },
  { keywords: ['fall', 'decline', 'collapse', 'decrease', 'shrink', 'crash', 'ruin'], effect: 'effect-shrink' },
  { keywords: ['flow', 'wave', 'current', 'stream', 'flood', 'ocean', 'river'], effect: 'effect-wave' },
]
function pickEffect(text) {
  const lower = (text || '').toLowerCase()
  for (const entry of ANIMATION_KEYWORDS) {
    if (entry.keywords.some((k) => lower.includes(k))) return entry.effect
  }
  return null
}

function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.max(0, Math.floor(s % 60))
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Both Video Lecture and Notes need a topic plan before they can generate. If Notes was already
// generated, reuse its topic breakdown so Lecture chapters and Notes sections stay consistent
// with each other instead of drifting from two independent plans.
async function ensureTopicPlan({ apiKey, notebook }) {
  if (notebook.notes?.topics?.length) {
    return {
      topics: notebook.topics?.length ? notebook.topics : [],
      noteTopics: notebook.notes.topics.map((t) => ({ title: t.title, mainIdea: t.mainIdea })),
      reviewPrompts: notebook.notes.reviewPrompts || [],
    }
  }
  const plan = await generateTopicPlan({ apiKey, title: notebook.title, sources: notebook.sources })
  return plan
}

export default function LearningStage({ notebook, onSave, apiKey, onNeedApiKey }) {
  const [tab, setTab] = useState('Video lecture')
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-slate-900">Learn the material</h2>
      <p className="text-slate-500 mt-1">A generated audio lecture, deeply detailed notes, and visualizations tailored to your content.</p>
      <div className="flex items-center gap-6 border-b border-slate-200 mt-6 mb-6">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`py-3 text-sm font-medium border-b-2 -mb-px transition ${tab === t ? 'border-blue-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Video lecture' && <VideoLectureGate notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />}
      {tab === 'Notes' && <NotesGate notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />}
      {tab === 'Specials' && <SpecialsGate notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />}
    </div>
  )
}

// ---------- Video Lecture ----------
function VideoLectureGate({ notebook, onSave, apiKey, onNeedApiKey }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const enabled = !!notebook.stageEnabled?.lecture
  const ready = enabled && !!notebook.lecture?.chapters?.length

  async function enable() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      const plan = await ensureTopicPlan({ apiKey, notebook })
      const lectureData = await generateLecture({ apiKey, title: notebook.title, sources: notebook.sources, noteTopics: plan.noteTopics })
      onSave({ ...notebook, stageEnabled: { ...notebook.stageEnabled, lecture: true }, lecture: lectureData, topics: notebook.topics?.length ? notebook.topics : plan.topics })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StageGate enabled={enabled} ready={ready} busy={busy} error={error} label="Video Lecture" onEnable={enable}>
      <VideoLecture notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />
    </StageGate>
  )
}

function VideoLecture({ notebook, onSave, apiKey, onNeedApiKey }) {
  const chapters = useMemo(() => notebook.lecture?.chapters || [], [notebook.id])
  const images = notebook.lecture?.images || []
  const estimatedTiming = useMemo(() => computeLectureTiming(chapters), [chapters])
  const playerRef = useRef(null)
  const scrubRef = useRef(null)
  const frameRef = useRef(null)
  const hideTimerRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [loadingAudio, setLoadingAudio] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const [rate, setRate] = useState(1)
  const [dragging, setDragging] = useState(false)
  const [flash, setFlash] = useState(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imagesBusy, setImagesBusy] = useState(false)
  const [imagesProgress, setImagesProgress] = useState('')
  const [imagesError, setImagesError] = useState('')
  const supported = isTTSSupported()
  const geminiMode = !!apiKey && !useFallback

  useEffect(() => {
    if (!chapters.length) return undefined
    if (!geminiMode && !supported) return undefined
    const player = geminiMode ? new AudioLecturePlayer({ chapters, apiKey, onError: () => setUseFallback(true) }) : new LecturePlayer({ chapters })
    playerRef.current = player
    const offs = [player.on('progress', setElapsed), player.on('chapterchange', setChapterIndex), player.on('statechange', setIsPlaying), player.on('loading', setLoadingAudio)]
    return () => {
      offs.forEach((f) => f?.())
      player.destroy()
    }
  }, [notebook.id, geminiMode])

  useEffect(() => {
    playerRef.current?.setRate?.(rate)
  }, [rate])

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === frameRef.current)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const wakeControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible((v) => (isPlaying ? false : v))
    }, CONTROLS_HIDE_MS)
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      wakeControls()
    }
    return () => hideTimerRef.current && clearTimeout(hideTimerRef.current)
  }, [isPlaying, wakeControls])

  function toggle() {
    const p = playerRef.current
    if (!p) return
    if (p.isPlaying) p.pause()
    else p.play()
    wakeControls()
  }
  function restart(i) {
    playerRef.current?.restartChapter(i)
    wakeControls()
  }
  function skip(delta, side) {
    playerRef.current?.skip?.(delta)
    setFlash(side)
    wakeControls()
    setTimeout(() => setFlash(null), 450)
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else frameRef.current?.requestFullscreen?.()
    wakeControls()
  }

  const onScrubMove = useCallback((e) => {
    if (!scrubRef.current) return
    const rect = scrubRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    playerRef.current?.seekRatio?.(ratio)
  }, [])

  useEffect(() => {
    if (!dragging) return undefined
    function onMove(e) {
      onScrubMove(e)
    }
    function onUp() {
      setDragging(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging, onScrubMove])

  async function generateVisuals() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setImagesBusy(true)
    setImagesError('')
    try {
      setImagesProgress('Planning illustrations…')
      const prompts = await generateLectureImagePrompts({ apiKey, notebook })
      if (!prompts.length) throw new Error('No illustration ideas came back — try again.')
      const results = []
      const failures = []
      for (let i = 0; i < prompts.length; i++) {
        setImagesProgress(`Generating illustration ${i + 1} of ${prompts.length}…`)
        try {
          const raw = await generateIllustration({ apiKey, prompt: prompts[i].prompt })
          const small = await downscaleDataUrl(raw, 800, 0.72).catch(() => raw)
          results.push({ chapterIndex: prompts[i].chapterIndex, caption: prompts[i].caption, dataUrl: small })
        } catch (e) {
          failures.push(e.message)
        }
      }
      if (results.length) onSave({ ...notebook, lecture: { ...notebook.lecture, images: results } })
      if (!results.length) setImagesError(`Couldn't generate any illustrations (${failures[0] || 'unknown error'}). Try again?`)
      else if (failures.length) setImagesError(`${results.length} of ${prompts.length} generated — the rest failed (${failures[0]}).`)
    } catch (e) {
      setImagesError(e.message)
    } finally {
      setImagesBusy(false)
      setImagesProgress('')
    }
  }

  if (!chapters.length) {
    return <EmptyHint icon={Sparkles} title="No lecture yet" body="Generate study materials in Creation to build your audio lecture." />
  }
  if (!geminiMode && !supported) {
    return <EmptyHint icon={Volume2} title="Narration isn't available" body="Add a Gemini API key in Settings for high-quality narration, or open this in Chrome/Edge for built-in speech support. You can still read the Notes tab." />
  }

  const total = playerRef.current?.total || estimatedTiming.total
  const pct = Math.min(100, (elapsed / total) * 100)
  const currentImage = images.find((img) => img.chapterIndex === chapterIndex) || (images.length ? images[Math.min(chapterIndex, images.length - 1)] : null)
  const effect = pickEffect(chapters[chapterIndex]?.script)

  const questionList = []
  chapters.forEach((c, i) => {
    const dur = playerRef.current?.durations?.[i] ?? estimatedTiming.durations[i]
    const offset = playerRef.current?.offsets?.[i] ?? estimatedTiming.offsets[i]
    ;(c.questions || []).forEach((q) => {
      questionList.push({ time: offset + (q.fraction || 0) * dur, question: q.question, chapterIndex: i })
    })
  })
  questionList.sort((a, b) => a.time - b.time)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div
          ref={frameRef}
          onMouseMove={wakeControls}
          onClick={wakeControls}
          className={`rounded-2xl overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 relative select-none ${isFullscreen ? 'w-screen h-screen' : 'aspect-video'}`}
        >
          <span className={`absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 bg-black/30 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur pointer-events-none transition-opacity ${controlsVisible ? 'opacity-100' : 'opacity-0'}`}>
            <Sparkles size={12} /> {geminiMode ? 'Narrated with Gemini' : 'Browser narration'}
          </span>

          {currentImage ? (
            <img key={currentImage.dataUrl} src={currentImage.dataUrl} alt={currentImage.caption || ''} className={`absolute inset-0 w-full h-full object-cover opacity-60 ${effect || ''}`} />
          ) : (
            !images.length && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="text-center px-6">
                  {imagesBusy ? (
                    <p className="text-white/70 text-sm flex items-center gap-2 justify-center">
                      <Spinner size={16} /> {imagesProgress}
                    </p>
                  ) : (
                    <PrimaryButton onClick={generateVisuals} className="bg-white/15 hover:bg-white/25 backdrop-blur">
                      <Sparkles size={14} /> Generate visuals
                    </PrimaryButton>
                  )}
                  {imagesError && <p className="text-rose-300 text-xs mt-2 max-w-xs">{imagesError}</p>}
                </div>
              </div>
            )
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-slate-950/50 pointer-events-none" />

          <button onClick={() => skip(-10, 'back')} className="absolute left-0 top-0 bottom-16 w-1/3 z-10" aria-label="Back 10 seconds" />
          <button onClick={() => skip(10, 'forward')} className="absolute right-0 top-0 bottom-16 w-1/3 z-10" aria-label="Forward 10 seconds" />
          {flash && (
            <div className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none text-white/90 flex flex-col items-center ${flash === 'back' ? 'left-8' : 'right-8'}`}>
              <span className="text-xs font-semibold bg-black/50 rounded-full px-3 py-1.5">{flash === 'back' ? '« 10s' : '10s »'}</span>
            </div>
          )}

          {/* Absolutely centered on the whole frame — independent of the bottom controls bar's height */}
          <button
            onClick={toggle}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-900 transition-all shadow-lg z-20 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          >
            {loadingAudio ? <Spinner size={22} /> : isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>

          <div className={`absolute bottom-0 left-0 right-0 p-4 z-20 transition-opacity ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div
              ref={scrubRef}
              onMouseDown={(e) => {
                setDragging(true)
                onScrubMove(e)
              }}
              onTouchStart={(e) => {
                setDragging(true)
                onScrubMove(e)
              }}
              className="h-2 bg-white/20 rounded-full overflow-hidden cursor-pointer relative group"
            >
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition pointer-events-none" style={{ left: `calc(${pct}% - 7px)` }} />
            </div>
            <div className="flex items-center justify-between text-white/70 text-xs mt-2">
              <span>
                {fmtTime(elapsed)} / {fmtTime(total)}
              </span>
              <div className="flex items-center gap-3">
                <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="bg-transparent text-white/80 text-xs outline-none cursor-pointer">
                  {RATES.map((r) => (
                    <option key={r} value={r} className="text-slate-900">
                      {r}x
                    </option>
                  ))}
                </select>
                <Volume2 size={14} />
                <button onClick={toggleFullscreen} className="hover:text-white transition" title="Fullscreen">
                  {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
        {useFallback && (
          <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-2">
            <Info size={12} /> Switched to your browser's built-in narration — Gemini audio had trouble generating for this lecture.
          </p>
        )}
        {images.length > 0 && !imagesBusy && (
          <button onClick={generateVisuals} className="text-xs text-blue-600 hover:underline mt-2">
            Regenerate visuals
          </button>
        )}
        <p className="text-slate-500 text-sm mt-3">
          Chapter {chapterIndex + 1} · {chapters[chapterIndex]?.title}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {chapters.map((c, i) => (
            <button key={i} onClick={() => restart(i)} className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${i === chapterIndex ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              {i + 1}. {c.title}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-5 h-fit">
        <p className="font-display font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <ListChecks size={16} className="text-blue-600" /> Questions as you watch
        </p>
        {questionList.length === 0 ? (
          <p className="text-sm text-slate-400">No check-in questions for this lecture.</p>
        ) : (
          <div className="space-y-3">
            {questionList.map((q, i) => (
              <button key={i} onClick={() => restart(q.chapterIndex)} className="w-full text-left rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 p-3 transition">
                <span className="text-xs font-semibold text-blue-600">{fmtTime(q.time)}</span>
                <p className="text-sm text-slate-700 mt-0.5">{q.question}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Notes (per-topic, generated one at a time, browsable sidebar) ----------
function NotesGate({ notebook, onSave, apiKey, onNeedApiKey }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const enabled = !!notebook.stageEnabled?.notes
  const ready = enabled && !!notebook.notes?.topics?.length

  async function enable() {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      const plan = await ensureTopicPlan({ apiKey, notebook })
      onSave({
        ...notebook,
        stageEnabled: { ...notebook.stageEnabled, notes: true },
        notes: { topics: plan.noteTopics.map((t) => ({ id: uid('topic'), title: t.title, mainIdea: t.mainIdea, detailed: null })), reviewPrompts: plan.reviewPrompts },
        topics: notebook.topics?.length ? notebook.topics : plan.topics,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StageGate enabled={enabled} ready={ready} busy={busy} error={error} label="Notes" onEnable={enable}>
      <NotesView notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />
    </StageGate>
  )
}

function NotesView({ notebook, onSave, apiKey, onNeedApiKey }) {
  const topics = notebook.notes?.topics || []
  const [selectedId, setSelectedId] = useState(topics[0]?.id || null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const selected = topics.find((t) => t.id === selectedId) || topics[0]

  const generateTopic = useCallback(
    async (topic) => {
      if (!topic || topic.detailed || busyId) return
      if (!apiKey) {
        onNeedApiKey()
        return
      }
      setBusyId(topic.id)
      setError('')
      try {
        const detailed = await generateTopicNotes({ apiKey, sources: notebook.sources, topic, allTopics: topics })
        onSave({ ...notebook, notes: { ...notebook.notes, topics: notebook.notes.topics.map((t) => (t.id === topic.id ? { ...t, detailed } : t)) } })
      } catch (e) {
        setError(e.message)
      } finally {
        setBusyId(null)
      }
    },
    [notebook, onSave, apiKey, onNeedApiKey, topics, busyId],
  )

  useEffect(() => {
    if (selected && !selected.detailed && !busyId) generateTopic(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  function saveTopicEdit(topicId, text) {
    onSave({ ...notebook, notes: { ...notebook.notes, topics: notebook.notes.topics.map((t) => (t.id === topicId ? { ...t, detailed: text } : t)) } })
  }

  if (!topics.length) {
    return <EmptyHint icon={Sparkles} title="No notes yet" body="Generate study materials in Creation to build your notes." />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-1 space-y-1">
        {topics.map((t) => (
          <button key={t.id} onClick={() => setSelectedId(t.id)} className={`w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl text-sm transition ${selected?.id === t.id ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
            {busyId === t.id ? <Spinner size={13} className="shrink-0" /> : t.detailed ? <Check size={13} className="text-emerald-500 shrink-0" /> : <Circle size={9} className="text-slate-300 shrink-0" />}
            <span className="truncate">{t.title}</span>
          </button>
        ))}
      </div>
      <div className="lg:col-span-3">
        {!selected ? null : busyId === selected.id ? (
          <div className="flex items-center gap-2 text-slate-400 py-16 justify-center">
            <Spinner size={18} /> Writing exhaustive notes for "{selected.title}"…
          </div>
        ) : selected.detailed ? (
          <EditableText value={selected.detailed} onSave={(text) => saveTopicEdit(selected.id, text)} rows={22} renderView={(v) => <div className="bg-white border border-slate-200 rounded-2xl p-8">{renderMarkdown(v)}</div>} />
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-rose-600 mb-3">{error}</p>
            <PrimaryButton onClick={() => generateTopic(selected)}>Try again</PrimaryButton>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ---------- Specials gate ----------
function SpecialsGate({ notebook, onSave, apiKey, onNeedApiKey }) {
  const enabled = !!notebook.stageEnabled?.specials
  if (!enabled) {
    return (
      <StageGate
        enabled={false}
        ready={false}
        label="Specials"
        body="You skipped this when generating. Turning it on doesn't cost anything by itself — each mindmap, chart, etc. still only generates when you actually open it."
        onEnable={() => onSave({ ...notebook, stageEnabled: { ...notebook.stageEnabled, specials: true } })}
      />
    )
  }
  return <Specials notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />
}
