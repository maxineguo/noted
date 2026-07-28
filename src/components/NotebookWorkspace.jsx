import { useState } from 'react'
import { ArrowLeft, Upload, BookOpen, Brain, MessageCircle, GraduationCap, Check, Lock, Pencil, Share2, Copy, EyeOff } from 'lucide-react'
import ProfileModal from './ProfileModal.jsx'
import { findAvatarPreset, AvatarSVG } from './avatars.jsx'
import { isFirebaseConfigured } from '../lib/firebase'
import { publishNotebook, unpublishNotebook } from '../lib/sharing'
import { Modal, PrimaryButton, SecondaryButton, Spinner } from './ui.jsx'
import CreationStage from './stages/CreationStage.jsx'
import LearningStage from './stages/LearningStage.jsx'
import PracticeStage from './stages/PracticeStage.jsx'
import AskTellStage from './stages/AskTellStage.jsx'
import TeachStage from './stages/TeachStage.jsx'

const STAGES = [
  { id: 'creation', label: 'Creation', icon: Upload },
  { id: 'learning', label: 'Learning', icon: BookOpen },
  { id: 'practice', label: 'Practice', icon: Brain, gateKey: 'practice' },
  { id: 'ask', label: 'Chat', icon: MessageCircle, gateKey: 'chat' },
  { id: 'teach', label: 'Teach', icon: GraduationCap, gateKey: 'teach' },
]

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function NotebookWorkspace({ notebook, onBack, onSave, apiKey, user, onLogout, onUpdateApiKey, onUpdateAvatar }) {
  const [stage, setStage] = useState(notebook.generated ? 'learning' : 'creation')
  const [showProfile, setShowProfile] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(notebook.title)
  const stageIndex = STAGES.findIndex((s) => s.id === stage)

  function commitTitle() {
    setEditingTitle(false)
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== notebook.title) onSave({ ...notebook, title: trimmed })
    else setTitleDraft(notebook.title)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 transition">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle()
                    if (e.key === 'Escape') {
                      setTitleDraft(notebook.title)
                      setEditingTitle(false)
                    }
                  }}
                  className="font-display font-semibold text-slate-900 border border-blue-300 rounded-lg px-2 py-0.5 outline-none"
                />
              ) : (
                <button onClick={() => setEditingTitle(true)} className="group/title flex items-center gap-1.5 text-left">
                  <h1 className="font-display font-semibold text-slate-900 truncate">{notebook.title}</h1>
                  <Pencil size={12} className="text-slate-300 group-hover/title:text-slate-500 shrink-0 transition" />
                </button>
              )}
              <p className="text-xs text-slate-400">Last edited {timeAgo(notebook.updatedAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isFirebaseConfigured && notebook.generated && (
              <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl px-3 py-1.5 transition">
                <Share2 size={14} /> Share
              </button>
            )}
            <button onClick={() => setShowProfile(true)} className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-cyan-400 text-white flex items-center justify-center font-medium text-sm ring-2 ring-white shadow hover:shadow-md transition">
              {findAvatarPreset(user.avatarId) ? <AvatarSVG preset={findAvatarPreset(user.avatarId)} size={36} /> : user.name?.[0]?.toUpperCase() || '?'}
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-6 flex items-center gap-1 overflow-x-auto">
          {STAGES.map((s, i) => {
            const notGeneratedYet = i > 0 && !notebook.generated
            const disabledByChoice = s.gateKey && notebook.generated && !notebook.stageEnabled?.[s.gateKey]
            const isActive = stage === s.id
            return (
              <button
                key={s.id}
                disabled={notGeneratedYet}
                onClick={() => setStage(s.id)}
                title={notGeneratedYet ? 'Generate study materials in Creation first' : disabledByChoice ? 'Not enabled yet — open the tab to turn it on' : undefined}
                className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${
                  isActive ? 'border-blue-600 text-slate-900' : notGeneratedYet ? 'border-transparent text-slate-300 cursor-not-allowed' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${isActive ? 'bg-blue-600 text-white' : disabledByChoice ? 'bg-slate-100 text-slate-400' : i < stageIndex ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                  {disabledByChoice ? <Lock size={10} /> : i < stageIndex ? <Check size={11} /> : i + 1}
                </span>
                {s.label}
              </button>
            )
          })}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {stage === 'creation' && <CreationStage notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={() => setShowProfile(true)} onGenerated={() => setStage('learning')} />}
        {stage === 'learning' && <LearningStage notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={() => setShowProfile(true)} />}
        {stage === 'practice' && <PracticeStage notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={() => setShowProfile(true)} />}
        {stage === 'ask' && <AskTellStage notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={() => setShowProfile(true)} />}
        {stage === 'teach' && <TeachStage notebook={notebook} onSave={onSave} apiKey={apiKey} onNeedApiKey={() => setShowProfile(true)} />}
      </main>

      {showProfile && <ProfileModal user={user} apiKey={apiKey} onUpdateApiKey={onUpdateApiKey} onUpdateAvatar={onUpdateAvatar} onLogout={onLogout} onClose={() => setShowProfile(false)} />}
      {showShare && <ShareModal notebook={notebook} onSave={onSave} onClose={() => setShowShare(false)} />}
    </div>
  )
}

function ShareModal({ notebook, onSave, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function share() {
    setBusy(true)
    setError('')
    try {
      const code = await publishNotebook(notebook)
      onSave({ ...notebook, shareCode: code })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function unshare() {
    setBusy(true)
    setError('')
    try {
      await unpublishNotebook(notebook.shareCode)
      onSave({ ...notebook, shareCode: null })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(notebook.shareCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal title="Share this notebook" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-4">Shares your Creation sources and Learning content (lecture, notes, specials) as a copy. Your practice history, chat, and teach sessions never leave your account.</p>
      {notebook.shareCode ? (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Share this code</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 text-center font-display text-2xl font-bold tracking-[0.3em] text-blue-700 bg-blue-50 border border-blue-100 rounded-xl py-3">{notebook.shareCode}</div>
            <button onClick={copyCode} className="w-11 h-11 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-500 transition shrink-0">
              <Copy size={16} />
            </button>
          </div>
          {copied && <p className="text-xs text-emerald-600 mt-2 text-center">Copied!</p>}
          <SecondaryButton onClick={unshare} busy={busy} className="w-full mt-5 text-rose-600 border-rose-200 hover:bg-rose-50">
            <EyeOff size={14} /> Stop sharing
          </SecondaryButton>
        </div>
      ) : (
        <PrimaryButton onClick={share} busy={busy} className="w-full">
          <Share2 size={16} /> Generate share code
        </PrimaryButton>
      )}
      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
    </Modal>
  )
}
