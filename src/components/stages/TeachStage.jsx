import { useState, useRef } from 'react'
import { Mic, MicOff, PenTool, FileText, AlertTriangle, CheckCircle2, Info, Sparkles, Flag, RefreshCw } from 'lucide-react'
import { createRecognizer, isSTTSupported } from '../../lib/speech'
import { evaluateTeaching } from '../../lib/gemini'
import { uid } from '../../lib/storage'
import { PrimaryButton, SecondaryButton, EmptyHint, StageGate } from '../ui.jsx'
import Whiteboard from '../Whiteboard.jsx'

const FEEDBACK_STYLE = {
  good: { icon: CheckCircle2, cls: 'bg-emerald-50 border-emerald-100 text-emerald-800', iconCls: 'text-emerald-500' },
  warn: { icon: AlertTriangle, cls: 'bg-amber-50 border-amber-100 text-amber-800', iconCls: 'text-amber-500' },
  error: { icon: AlertTriangle, cls: 'bg-rose-50 border-rose-100 text-rose-800', iconCls: 'text-rose-500' },
}

const EMPTY_CHECKPOINT = { transcriptLen: 0, docLen: 0 }

export default function TeachStage({ notebook, onSave, apiKey, onNeedApiKey }) {
  const enabled = !!notebook.stageEnabled?.teach

  if (!notebook.generated) {
    return <EmptyHint icon={Sparkles} title="Nothing to teach yet" body="Generate study materials in Creation first, then come back to teach it back." />
  }

  return (
    <StageGate enabled={enabled} ready={enabled} label="Teach" onEnable={() => onSave({ ...notebook, stageEnabled: { ...notebook.stageEnabled, teach: true } })}>
      <TeachContent notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />
    </StageGate>
  )
}

function TeachContent({ notebook, onSave, apiKey, onNeedApiKey }) {
  const [topics, setTopics] = useState(() => (notebook.teachTopics?.length ? notebook.teachTopics : (notebook.topics || []).map((t) => ({ label: t, done: false }))))
  const [silentMode, setSilentMode] = useState(false)
  const [listening, setListening] = useState(false)
  const [finalTranscript, setFinalTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [silentText, setSilentText] = useState('')
  const [docText, setDocText] = useState('')
  const [panel, setPanel] = useState('whiteboard')
  const [feedback, setFeedback] = useState([])
  const [checkpoint, setCheckpoint] = useState(EMPTY_CHECKPOINT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const recognizerRef = useRef(null)
  const whiteboardRef = useRef(null)

  const sttOk = isSTTSupported()
  const speechText = silentMode ? silentText : finalTranscript

  function stopListening() {
    recognizerRef.current?.stop()
    setListening(false)
  }

  function toggleListening() {
    if (listening) {
      stopListening()
      return
    }
    const rec = createRecognizer({
      onResult: ({ finalText, interimText }) => {
        setFinalTranscript(finalText)
        setInterim(interimText)
      },
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    })
    if (!rec) return
    recognizerRef.current = rec
    rec.start()
    setListening(true)
  }

  async function runEvaluation(isFinal) {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      const whiteboardImageDataUrl = whiteboardRef.current?.getDataUrl?.()
      const newSpeech = speechText.slice(checkpoint.transcriptLen)
      const newDoc = docText.slice(checkpoint.docLen)
      const newSinceCheckpoint = [newSpeech, newDoc].filter(Boolean).join('\n\n')
      const evalResult = await evaluateTeaching({
        apiKey,
        notebook,
        transcript: speechText,
        whiteboardImageDataUrl,
        docText,
        topics,
        previousFeedback: feedback,
        newSinceCheckpoint,
      })
      const updatedTopics = topics.map((t) => (evalResult.topicsCovered?.includes(t.label) ? { ...t, done: true } : t))
      setTopics(updatedTopics)
      const newFeedbackItems = (evalResult.feedback || []).map((f) => ({ ...f, id: uid('fb') }))
      const mergedFeedback = [...newFeedbackItems, ...feedback]
      setFeedback(mergedFeedback)
      setCheckpoint({ transcriptLen: speechText.length, docLen: docText.length })
      if (isFinal) {
        const sessions = [...(notebook.teachSessions || []), { date: Date.now(), score: evalResult.masteryScore, summary: evalResult.summary }]
        onSave({ ...notebook, teachTopics: updatedTopics, teachSessions: sessions })
        setResult({ ...evalResult, feedback: mergedFeedback })
        if (listening) stopListening()
      } else {
        onSave({ ...notebook, teachTopics: updatedTopics })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function resetSession() {
    if (listening) stopListening()
    setResult(null)
    setFeedback([])
    setCheckpoint(EMPTY_CHECKPOINT)
    setFinalTranscript('')
    setInterim('')
    setSilentText('')
    setDocText('')
    setTopics((notebook.topics || []).map((t) => ({ label: t, done: false })))
    whiteboardRef.current?.clear?.()
  }

  function confirmReset() {
    if (window.confirm('Reset this teaching session? This clears your transcript, doc, whiteboard, and feedback so far.')) {
      resetSession()
    }
  }

  if (result) {
    return (
      <div className="max-w-lg mx-auto text-center py-14">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white flex items-center justify-center mx-auto text-2xl font-display font-semibold">{result.masteryScore}</div>
        <h2 className="font-display text-2xl font-semibold text-slate-900 mt-5">Mastery score</h2>
        <p className="text-slate-600 mt-3 leading-relaxed">{result.summary}</p>
        <div className="text-left mt-6 space-y-2.5">
          {(result.feedback || []).map((f, i) => (
            <FeedbackCard key={f.id || i} item={f} />
          ))}
        </div>
        <PrimaryButton onClick={resetSession} className="mt-8 mx-auto">
          <RefreshCw size={15} /> Teach it again
        </PrimaryButton>
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-slate-900">Teach it back</h2>
      <p className="text-slate-500 mt-1">The best way to know something is to teach it. We'll listen (or read) and coach you.</p>

      <div className="flex items-center gap-3 mt-6 flex-wrap">
        {!silentMode ? (
          <button onClick={toggleListening} disabled={!sttOk} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${listening ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-700 hover:border-slate-300'} disabled:opacity-40`}>
            <Mic size={16} /> {listening ? 'Listening…' : 'Speak'}
          </button>
        ) : (
          <span className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-400">
            <Mic size={16} /> Speak (off)
          </span>
        )}
        <button
          onClick={() => {
            setSilentMode((v) => !v)
            if (listening) stopListening()
          }}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border transition ${silentMode ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
        >
          <MicOff size={16} /> Silent mode
        </button>
        {!sttOk && !silentMode && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <Info size={12} /> Speech recognition isn't supported in this browser — try Silent mode, or switch to Chrome/Edge.
          </span>
        )}
        <button onClick={confirmReset} className="ml-auto flex items-center gap-1.5 text-sm text-slate-400 hover:text-rose-600 transition">
          <RefreshCw size={14} /> Reset session
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 space-y-4">
          {silentMode ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Type your explanation</p>
              <textarea
                value={silentText}
                onChange={(e) => setSilentText(e.target.value)}
                rows={6}
                placeholder="Type what you'd say out loud, as if teaching a beginner…"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
              />
            </div>
          ) : (
            (finalTranscript || interim) && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Live transcript</p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {finalTranscript}
                  <span className="text-slate-400">{interim}</span>
                </p>
              </div>
            )
          )}

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="inline-flex bg-slate-100 rounded-xl p-1 mb-4">
              <button onClick={() => setPanel('whiteboard')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${panel === 'whiteboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <PenTool size={14} /> Whiteboard
              </button>
              <button onClick={() => setPanel('doc')} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${panel === 'doc' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                <FileText size={14} /> Doc
              </button>
            </div>
            {/* Both stay mounted (just hidden) so switching tabs never loses whiteboard strokes or doc text */}
            <div className={panel === 'whiteboard' ? '' : 'hidden'}>
              <Whiteboard ref={whiteboardRef} />
            </div>
            <div className={panel === 'doc' ? '' : 'hidden'}>
              <textarea
                value={docText}
                onChange={(e) => setDocText(e.target.value)}
                rows={12}
                placeholder="Type notes to help make your explanation clearer — equations, definitions, structure…"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3.5 py-2.5">{error}</p>}

          <div className="flex gap-2">
            <SecondaryButton onClick={() => runEvaluation(false)} busy={busy} disabled={busy || (!speechText.trim() && !docText.trim())}>
              Check my progress
            </SecondaryButton>
            <PrimaryButton onClick={() => runEvaluation(true)} busy={busy} disabled={busy || (!speechText.trim() && !docText.trim())}>
              <Flag size={15} /> Finish
            </PrimaryButton>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
              <Info size={13} /> Topics to cover
            </p>
            <div className="space-y-2.5">
              {topics.map((t, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${t.done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-200'}`}>{t.done && <CheckCircle2 size={12} />}</span>
                  <span className={`text-sm ${t.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
              <AlertTriangle size={13} /> Live feedback
            </p>
            {feedback.length === 0 ? <p className="text-sm text-slate-400">Click "Check my progress" once you've said or written something.</p> : <div className="space-y-2.5">{feedback.map((f) => <FeedbackCard key={f.id} item={f} />)}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function FeedbackCard({ item }) {
  const style = FEEDBACK_STYLE[item.kind] || FEEDBACK_STYLE.warn
  const Icon = style.icon
  return (
    <div className={`border rounded-xl px-3.5 py-3 ${style.cls}`}>
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <Icon size={13} className={style.iconCls} /> {item.title}
      </p>
      <p className="text-sm mt-0.5 opacity-90">{item.body}</p>
    </div>
  )
}
