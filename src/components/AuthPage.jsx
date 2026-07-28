import { useState } from 'react'
import { Upload, BookOpen, Brain, MessageCircle, GraduationCap, Sparkles, ArrowRight, Cloud } from 'lucide-react'
import { createUser, verifyLogin, setSession } from '../lib/storage'
import { isFirebaseConfigured } from '../lib/firebase'
import { cloudSignUp, cloudSignIn, friendlyAuthError } from '../lib/cloudAuth'

const STAGES = [
  { icon: Upload, label: 'Create' },
  { icon: BookOpen, label: 'Learn' },
  { icon: Brain, label: 'Practice' },
  { icon: MessageCircle, label: 'Ask' },
  { icon: GraduationCap, label: 'Teach' },
]

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      {children}
    </label>
  )
}

export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Enter an email and password.')
      return
    }
    setBusy(true)
    try {
      if (isFirebaseConfigured) {
        if (mode === 'signup') {
          if (!name.trim()) throw new Error('Enter your name.')
          const fbUser = await cloudSignUp({ name: name.trim(), email: email.trim(), password })
          onAuth({ id: fbUser.uid, name: name.trim(), email: fbUser.email, avatarId: null })
        } else {
          const fbUser = await cloudSignIn({ email: email.trim(), password })
          onAuth({ id: fbUser.uid, name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Student', email: fbUser.email, avatarId: null })
        }
      } else if (mode === 'signup') {
        if (!name.trim()) throw new Error('Enter your name.')
        if (password.length < 4) throw new Error('Password should be at least 4 characters.')
        const user = createUser({ name: name.trim(), email: email.trim(), password })
        setSession(user.id)
        onAuth(user)
      } else {
        const user = verifyLogin(email.trim(), password)
        if (!user) throw new Error('No account matches that email and password.')
        setSession(user.id)
        onAuth(user)
      }
    } catch (err) {
      setError(isFirebaseConfigured ? friendlyAuthError(err) : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      <div className="relative md:w-[46%] min-h-[340px] md:min-h-screen overflow-hidden bg-slate-950 flex flex-col justify-between p-8 md:p-12">
        <div className="absolute -inset-32 bg-gradient-to-br from-blue-800 via-blue-600 to-cyan-400 animate-drift opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,0.16),transparent_55%)]" />

        <div className="relative flex items-center gap-2 text-white">
          <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
            <Sparkles size={18} />
          </div>
          <span className="font-display font-semibold text-lg tracking-tight">Noted</span>
        </div>

        <div className="relative">
          <h1 className="font-display text-white text-4xl md:text-5xl font-semibold leading-[1.08] tracking-tight max-w-md">
            Turn anything you study into a lecture, notes, and practice.
          </h1>
          <p className="mt-4 text-blue-100/90 max-w-sm text-[15px] leading-relaxed">
            Upload your notes. Noted builds a real study pipeline around them — a spoken lecture, encyclopedic notes, practice questions, a tutor that knows your material, and a place to teach it back.
          </p>
        </div>

        <div className="relative">
          <div className="relative h-9">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-white/25" />
            <div className="absolute inset-0 flex items-center">
              {STAGES.map((s) => (
                <div key={s.label} className="flex-1 flex justify-center">
                  <div className="w-9 h-9 rounded-full bg-white/12 ring-1 ring-white/30 backdrop-blur flex items-center justify-center text-white">
                    <s.icon size={16} />
                  </div>
                </div>
              ))}
            </div>
            <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_12px_4px_rgba(103,232,249,0.55)] animate-travel" />
          </div>
          <div className="flex text-[11px] text-blue-100/70 mt-2">
            {STAGES.map((s) => (
              <span key={s.label} className="flex-1 text-center">
                {s.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-semibold text-slate-900">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="text-slate-500 mt-1 text-sm">{mode === 'signin' ? 'Sign in to your notebooks.' : 'Start studying smarter in a minute.'}</p>

          <div className="mt-6 grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1">
            <button type="button" onClick={() => switchMode('signin')} className={`py-2 rounded-lg text-sm font-medium transition ${mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Sign in
            </button>
            <button type="button" onClick={() => switchMode('signup')} className={`py-2 rounded-lg text-sm font-medium transition ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Sign up
            </button>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} type="text" placeholder="Ada Lovelace" className={inputClass} autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@school.edu" className={inputClass} autoComplete="email" />
            </Field>
            <Field label="Password">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" className={inputClass} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </Field>

            {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>}

            <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium rounded-xl py-2.5 transition flex items-center justify-center gap-2">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
              <ArrowRight size={16} />
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-6 text-center leading-relaxed flex items-center justify-center gap-1.5">
            {isFirebaseConfigured ? (
              <>
                <Cloud size={12} /> Synced to your account — access your notebooks on any device.
              </>
            ) : (
              'Everything is stored locally in this browser — no server, no cost, and it works offline. See the README for details.'
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
