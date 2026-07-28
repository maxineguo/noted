import { useState } from 'react'
import { KeyRound, LogOut, ExternalLink, CheckCircle2, AlertCircle, Pencil } from 'lucide-react'
import { testApiKey } from '../lib/gemini'
import { AVATAR_PRESETS, EMOJI_CATEGORIES, AvatarSVG, findAvatarPreset } from './avatars.jsx'
import { Modal, Field, inputClass, PrimaryButton, SecondaryButton } from './ui.jsx'

export default function ProfileModal({ user, apiKey, onUpdateApiKey, onUpdateAvatar, onLogout, onClose }) {
  const [key, setKey] = useState(apiKey || '')
  const [status, setStatus] = useState(null)
  const [message, setMessage] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const currentPreset = findAvatarPreset(user.avatarId)

  async function testAndSave() {
    if (!key.trim()) {
      onUpdateApiKey('')
      setStatus(null)
      return
    }
    setStatus('testing')
    setMessage('')
    try {
      await testApiKey(key.trim())
      onUpdateApiKey(key.trim())
      setStatus('ok')
      setMessage('Key saved and verified.')
    } catch (e) {
      setStatus('error')
      setMessage(e.message)
    }
  }

  if (pickerOpen) {
    return (
      <Modal title="Choose a profile picture" onClose={() => setPickerOpen(false)} wide>
        <AvatarPicker currentId={user.avatarId} onPick={(id) => { onUpdateAvatar(id); setPickerOpen(false) }} />
      </Modal>
    )
  }

  return (
    <Modal title="Profile" onClose={onClose}>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setPickerOpen(true)} className="relative group shrink-0" title="Change profile picture">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-cyan-400 text-white flex items-center justify-center font-semibold text-xl">
            {currentPreset ? <AvatarSVG preset={currentPreset} size={56} /> : user.name?.[0]?.toUpperCase() || '?'}
          </div>
          <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            <Pencil size={16} className="text-white" />
          </span>
        </button>
        <div className="min-w-0">
          <p className="font-medium text-slate-900 truncate">{user.name}</p>
          <p className="text-sm text-slate-500 truncate">{user.email}</p>
          <button onClick={() => setPickerOpen(true)} className="text-xs font-medium text-blue-600 hover:underline mt-0.5">
            Change picture
          </button>
        </div>
      </div>

      <Field
        label={
          <span className="flex items-center gap-1.5">
            <KeyRound size={13} /> Gemini API key
          </span>
        }
        hint="Stored only in this browser. Used to generate your video lectures, notes, practice sets, and tutoring responses."
      >
        <input
          value={key}
          onChange={(e) => {
            setKey(e.target.value)
            setStatus(null)
          }}
          type="password"
          placeholder="AIza…"
          className={inputClass}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      {status === 'ok' && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 mt-2">
          <CheckCircle2 size={14} /> {message}
        </p>
      )}
      {status === 'error' && (
        <p className="flex items-center gap-1.5 text-sm text-rose-600 mt-2">
          <AlertCircle size={14} /> {message}
        </p>
      )}

      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2.5">
        Get a free Gemini API key <ExternalLink size={12} />
      </a>

      <div className="flex gap-2 mt-6">
        <PrimaryButton onClick={testAndSave} busy={status === 'testing'} className="flex-1">
          Save changes
        </PrimaryButton>
        <SecondaryButton onClick={onLogout} className="text-rose-600 border-rose-200 hover:bg-rose-50">
          <LogOut size={14} /> Log out
        </SecondaryButton>
      </div>
    </Modal>
  )
}

function AvatarPicker({ currentId, onPick }) {
  const [tab, setTab] = useState('Illustrated')
  const tabs = ['Illustrated', ...EMOJI_CATEGORIES.map((c) => c.name)]
  const items = tab === 'Illustrated' ? AVATAR_PRESETS : EMOJI_CATEGORIES.find((c) => c.name === tab)?.items.map((emoji) => ({ id: `emoji-${emoji.codePointAt(0).toString(16)}`, emoji, kind: 'emoji' })) || []

  return (
    <div>
      <div className="flex gap-1 flex-wrap mb-4 border-b border-slate-100 pb-3">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`text-xs font-medium px-3 py-1.5 rounded-full transition ${tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-6 gap-3 max-h-80 overflow-y-auto pr-1">
        {items.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onPick(preset.id)}
            title={preset.label}
            className={`rounded-xl p-1.5 transition ${currentId === preset.id ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-slate-50'}`}
          >
            <AvatarSVG preset={preset} size={48} />
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-4 text-center">Pick one — it's saved instantly.</p>
    </div>
  )
}
