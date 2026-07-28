import { useState, useRef, useEffect } from 'react'
import { Send, Sparkles, Lightbulb, ChevronDown, ChevronUp, Mic, MicOff } from 'lucide-react'
import { chatWithNotebook, generateTargetedPractice } from '../../lib/gemini'
import { renderInline } from '../../lib/markdown'
import { createRecognizer, isSTTSupported } from '../../lib/speech'
import { uid } from '../../lib/storage'
import { EmptyHint, Spinner, StageGate } from '../ui.jsx'

const SUGGESTED = ["Explain this like I'm 12", 'Quiz me on this notebook', 'Compare the key ideas', 'What am I weakest on?']

export default function AskTellStage({ notebook, onSave, apiKey, onNeedApiKey }) {
  const enabled = !!notebook.stageEnabled?.chat
  const ready = enabled

  if (!notebook.generated) {
    return <EmptyHint icon={Sparkles} title="Nothing to ask yet" body="Generate study materials in Creation first, then come back to chat about your notebook." />
  }

  return (
    <StageGate enabled={enabled} ready={ready} label="Chat" onEnable={() => onSave({ ...notebook, stageEnabled: { ...notebook.stageEnabled, chat: true } })}>
      <ChatContent notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={onNeedApiKey} />
    </StageGate>
  )
}

function ChatContent({ notebook, onSave, apiKey, onNeedApiKey }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [listening, setListening] = useState(false)
  const scrollRef = useRef(null)
  const recognizerRef = useRef(null)
  const textareaRef = useRef(null)
  const chat = notebook.chat || []
  const sttOk = isSTTSupported()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat.length, busy])

  useEffect(() => () => recognizerRef.current?.stop?.(), [])

  async function send(message) {
    if (!message.trim() || busy) return
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    if (listening) toggleDictation()
    setError('')
    const nextChat = [...chat, { id: uid('msg'), role: 'user', content: message.trim() }]
    onSave({ ...notebook, chat: nextChat })
    setInput('')
    setBusy(true)
    try {
      const reply = await chatWithNotebook({ apiKey, notebook, history: chat, message: message.trim() })
      onSave({ ...notebook, chat: [...nextChat, { id: uid('msg'), role: 'assistant', content: reply }] })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function toggleDictation() {
    if (listening) {
      recognizerRef.current?.stop()
      setListening(false)
      return
    }
    const baseText = input ? `${input} ` : ''
    const rec = createRecognizer({
      onResult: ({ finalText, interimText }) => setInput(`${baseText}${finalText}${interimText}`),
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    })
    if (!rec) return
    recognizerRef.current = rec
    rec.start()
    setListening(true)
  }

  async function requestPractice(topicHint) {
    if (!apiKey) {
      onNeedApiKey()
      return
    }
    setBusy(true)
    setError('')
    try {
      const items = await generateTargetedPractice({ apiKey, notebook, topic: topicHint })
      onSave({ ...notebook, chat: [...chat, { id: uid('msg'), role: 'assistant', content: '__TARGETED_PRACTICE__', practice: items }] })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const lastAssistantText = [...chat].reverse().find((m) => m.role === 'assistant' && m.content !== '__TARGETED_PRACTICE__')

  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-slate-900">Chat</h2>
      <p className="text-slate-500 mt-1">Chat with an AI tutor that knows your sources. Get targeted practice on the spot.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl flex flex-col" style={{ height: '65vh' }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-cyan-400 text-white flex items-center justify-center">
              <Sparkles size={16} />
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Study assistant</p>
              <p className="text-xs text-slate-400">
                Grounded in your {notebook.sources.length} source{notebook.sources.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {chat.length === 0 && <p className="text-sm text-slate-400 text-center py-10">Ask anything about your notebook to get started.</p>}
            {chat.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Spinner size={14} /> Thinking…
              </div>
            )}
          </div>
          {error && <p className="px-5 pb-2 text-xs text-rose-600 shrink-0">{error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-end gap-2 p-4 border-t border-slate-100 shrink-0"
          >
            {sttOk && (
              <button type="button" onClick={toggleDictation} title={listening ? 'Stop dictating' : 'Dictate your question'} className={`w-10 h-10 rounded-xl flex items-center justify-center transition shrink-0 ${listening ? 'bg-rose-100 text-rose-600' : 'border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={listening ? 'Listening…' : 'Ask anything about your notebook… (Shift+Enter for a new line)'}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none max-h-32"
            />
            <button type="submit" disabled={busy || !input.trim()} className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white flex items-center justify-center transition shrink-0">
              <Send size={16} />
            </button>
          </form>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 h-fit">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Suggested prompts</p>
          <div className="space-y-2">
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={busy} className="w-full flex items-center justify-between text-left text-sm text-slate-700 border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 rounded-xl px-3.5 py-2.5 transition disabled:opacity-50">
                {s} <ChevronDown size={14} className="-rotate-90 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
          {lastAssistantText && (
            <button onClick={() => requestPractice(lastAssistantText.content.slice(0, 250))} disabled={busy} className="w-full flex items-center justify-center gap-1.5 mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-100 hover:bg-blue-50 rounded-xl px-3.5 py-2.5 transition disabled:opacity-50">
              <Lightbulb size={14} /> Practice questions on that
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap">{message.content}</div>
      </div>
    )
  }
  if (message.content === '__TARGETED_PRACTICE__') {
    return (
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide flex items-center gap-1.5 mb-3">
          <Lightbulb size={13} /> Targeted practice
        </p>
        <div className="space-y-3">
          {(message.practice || []).map((item, i) => (
            <PracticeItem key={i} index={i} item={item} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex justify-start">
      <div className="bg-slate-100 text-slate-800 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%] text-sm whitespace-pre-wrap leading-relaxed">{renderInline(message.content, message.id)}</div>
    </div>
  )
}

function PracticeItem({ index, item }) {
  const [show, setShow] = useState(false)
  return (
    <div className="border border-slate-100 rounded-xl p-3 bg-white">
      <p className="text-sm text-slate-800">
        <span className="font-semibold text-blue-600">{index + 1}.</span> {item.question}
      </p>
      <button onClick={() => setShow((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline mt-2">
        {show ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {show ? 'Hide' : 'Show'} explanation
      </button>
      {show && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{item.explanation}</p>}
    </div>
  )
}
