import { useState } from 'react'
import { X, Pencil, Sparkles } from 'lucide-react'

export const inputClass =
  'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition'

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-white rounded-2xl shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto animate-fade-up`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="font-display font-semibold text-lg text-slate-900">{title}</h2>
          {onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
}
export function Badge({ children, tone = 'slate', className = '' }) {
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${TONES[tone]} ${className}`}>{children}</span>
}

export function Spinner({ size = 16, className = '' }) {
  return <div className={`animate-spin rounded-full border-2 border-current border-t-transparent shrink-0 ${className}`} style={{ width: size, height: size }} />
}

export function PrimaryButton({ children, className = '', busy = false, ...props }) {
  return (
    <button {...props} disabled={props.disabled || busy} className={`inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl px-4 py-2.5 transition ${className}`}>
      {busy && <Spinner size={14} />}
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...props }) {
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-medium rounded-xl px-4 py-2.5 transition ${className}`}>
      {children}
    </button>
  )
}

export function IconButton({ children, className = '', active = false, ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg transition ${active ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'} ${className}`}
    >
      {children}
    </button>
  )
}

export function EditableText({ value, onSave, rows = 16, placeholder, renderView }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  function startEdit() {
    setDraft(value || '')
    setEditing(true)
  }
  function save() {
    onSave(draft)
    setEditing(false)
  }
  function cancel() {
    setDraft(value || '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div>
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-xl border border-blue-300 px-4 py-3 text-sm leading-relaxed focus:ring-2 focus:ring-blue-500/20 outline-none resize-y font-sans text-slate-800"
        />
        <div className="flex gap-2 mt-3">
          <PrimaryButton onClick={save}>Save</PrimaryButton>
          <SecondaryButton onClick={cancel}>Cancel</SecondaryButton>
        </div>
      </div>
    )
  }

  return (
    <div className="relative group">
      <button onClick={startEdit} className="absolute top-3 right-3 z-10 flex items-center gap-1 text-xs font-medium bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-blue-600 hover:border-blue-200 rounded-full px-3 py-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
        <Pencil size={12} /> Edit
      </button>
      {renderView(value)}
    </div>
  )
}

// Handles the 3 states a selectively-generated stage can be in: disabled (user unchecked it),
// enabled but not yet generated (lazy — shows a generate button + loading), or ready (renders
// the real content). Reused for Practice/Chat/Teach tab locking and Learning's sub-areas.
export function StageGate({ enabled, ready, busy, error, label, body, onEnable, children }) {
  if (ready) return children
  return (
    <EmptyHint
      icon={Sparkles}
      title={enabled ? `Generating ${label}…` : `${label} isn't enabled yet`}
      body={enabled ? "This is being generated now — it'll only take a moment." : body || `You skipped this when generating — enable it now and it'll be ready in a moment.`}
      action={
        enabled ? (
          busy ? (
            <Spinner size={20} className="text-blue-600" />
          ) : error ? (
            <div>
              <p className="text-sm text-rose-600 mb-3">{error}</p>
              <PrimaryButton onClick={onEnable}>Try again</PrimaryButton>
            </div>
          ) : (
            <Spinner size={20} className="text-blue-600" />
          )
        ) : (
          <PrimaryButton onClick={onEnable} busy={busy}>
            Enable & generate
          </PrimaryButton>
        )
      }
    />
  )
}

export function EmptyHint({ icon: Icon, title, body, action }) {
  return (
    <div className="text-center py-16 px-6">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <Icon size={20} />
        </div>
      )}
      <h3 className="font-display font-semibold text-slate-900 mt-4">{title}</h3>
      {body && <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
