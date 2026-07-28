import { useState, useEffect, useCallback, useRef } from 'react'
import { getSession, clearSession, getNotebooks, upsertNotebook, deleteNotebookForever, getApiKey, setApiKey as persistApiKey, updateUserAvatar } from './lib/storage'
import { isFirebaseConfigured } from './lib/firebase'
import { onCloudAuthChange, cloudSignOut } from './lib/cloudAuth'
import { subscribeNotebooksCloud, saveNotebookCloud, deleteNotebookCloud, subscribeUserProfileCloud, updateUserProfileCloud } from './lib/cloudStore'
import AuthPage from './components/AuthPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import NotebookWorkspace from './components/NotebookWorkspace.jsx'
import StudySession from './components/StudySession.jsx'

function normalizeCloudUser(fbUser) {
  if (!fbUser) return null
  return { id: fbUser.uid, name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Student', email: fbUser.email, avatarId: null }
}

export default function App() {
  // Local mode resolves synchronously (matches the original behavior exactly); cloud mode
  // resolves async via Firebase's auth listener, so we start "loading" only in that case.
  const [user, setUser] = useState(() => (isFirebaseConfigured ? null : getSession()))
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured)
  const [view, setView] = useState('dashboard')
  const [activeNotebookId, setActiveNotebookId] = useState(null)
  const [notebooks, setNotebooks] = useState([])
  const [apiKey, setApiKeyState] = useState('')
  const [cloudError, setCloudError] = useState('')
  const notebooksRef = useRef([])
  notebooksRef.current = notebooks

  // ---- Auth bootstrap ----
  useEffect(() => {
    if (!isFirebaseConfigured) return undefined
    let unsub = () => {}
    onCloudAuthChange((fbUser) => {
      setUser((prev) => {
        const normalized = normalizeCloudUser(fbUser)
        // Preserve a locally-known avatarId across re-normalizations until the profile
        // subscription below reports the real one.
        return normalized && prev?.id === normalized.id ? { ...normalized, avatarId: prev.avatarId } : normalized
      })
      setAuthLoading(false)
    }).then((u) => {
      unsub = u
    })
    return () => unsub()
  }, [])

  // ---- Data subscriptions (cloud: real-time; local: one-shot on user change) ----
  useEffect(() => {
    if (!user) {
      setNotebooks([])
      setApiKeyState('')
      return undefined
    }
    if (!isFirebaseConfigured) {
      setNotebooks(getNotebooks(user.id))
      setApiKeyState(getApiKey(user.id))
      return undefined
    }
    setCloudError('')
    let unsubNotebooks = () => {}
    let unsubProfile = () => {}
    subscribeNotebooksCloud(user.id, setNotebooks, setCloudError).then((u) => {
      unsubNotebooks = u
    })
    subscribeUserProfileCloud(user.id, (profile) => {
      setApiKeyState(profile.apiKey || '')
      setUser((prev) => (prev ? { ...prev, avatarId: profile.avatarId ?? prev.avatarId } : prev))
    }).then((u) => {
      unsubProfile = u
    })
    return () => {
      unsubNotebooks()
      unsubProfile()
    }
  }, [user?.id])

  const refreshNotebooks = useCallback(() => {
    if (user && !isFirebaseConfigured) setNotebooks(getNotebooks(user.id))
    // Cloud mode refreshes itself via the onSnapshot listener — nothing to do here.
  }, [user])

  async function handleLogout() {
    if (isFirebaseConfigured) await cloudSignOut().catch(() => {})
    else clearSession()
    setUser(null)
    setView('dashboard')
    setActiveNotebookId(null)
    setNotebooks([])
  }

  function openNotebook(id) {
    setActiveNotebookId(id)
    setView('notebook')
  }

  function backToDashboard() {
    setView('dashboard')
    setActiveNotebookId(null)
    refreshNotebooks()
  }

  function saveNotebook(nb) {
    if (!user) return
    if (isFirebaseConfigured) {
      // Optimistic local update so the UI feels instant even before Firestore round-trips.
      setNotebooks((prev) => {
        const idx = prev.findIndex((n) => n.id === nb.id)
        const next = { ...nb, updatedAt: Date.now() }
        if (idx === -1) return [next, ...prev]
        const copy = [...prev]
        copy[idx] = next
        return copy
      })
      saveNotebookCloud(user.id, nb).catch((e) => setCloudError(e.message))
    } else {
      upsertNotebook(user.id, nb)
      refreshNotebooks()
    }
  }

  function deleteNotebook(id) {
    if (!user) return
    if (isFirebaseConfigured) {
      setNotebooks((prev) => prev.filter((n) => n.id !== id))
      deleteNotebookCloud(user.id, id).catch((e) => setCloudError(e.message))
    } else {
      deleteNotebookForever(user.id, id)
      refreshNotebooks()
    }
    if (activeNotebookId === id) backToDashboard()
  }

  function updateApiKey(key) {
    if (!user) return
    setApiKeyState(key)
    if (isFirebaseConfigured) updateUserProfileCloud(user.id, { apiKey: key }).catch((e) => setCloudError(e.message))
    else persistApiKey(user.id, key)
  }

  function updateAvatar(avatarId) {
    if (!user) return
    setUser((prev) => ({ ...prev, avatarId }))
    if (isFirebaseConfigured) updateUserProfileCloud(user.id, { avatarId }).catch((e) => setCloudError(e.message))
    else updateUserAvatar(user.id, avatarId)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full border-2 border-blue-600 border-t-transparent w-8 h-8" />
      </div>
    )
  }

  if (!user) return <AuthPage onAuth={setUser} />

  const activeNotebook = notebooksRef.current.find((n) => n.id === activeNotebookId) || null

  const mainView =
    view === 'notebook' && activeNotebook ? (
      <NotebookWorkspace
        key={activeNotebook.id}
        notebook={activeNotebook}
        onBack={backToDashboard}
        onSave={saveNotebook}
        apiKey={apiKey}
        user={user}
        onLogout={handleLogout}
        onUpdateApiKey={updateApiKey}
        onUpdateAvatar={updateAvatar}
      />
    ) : (
      <Dashboard
        user={user}
        notebooks={notebooks}
        onOpenNotebook={openNotebook}
        onCreateNotebook={(nb) => {
          saveNotebook(nb)
          openNotebook(nb.id)
        }}
        onSaveNotebook={saveNotebook}
        onDeleteNotebook={deleteNotebook}
        onLogout={handleLogout}
        apiKey={apiKey}
        onUpdateApiKey={updateApiKey}
        onUpdateAvatar={updateAvatar}
      />
    )

  // StudySession lives at this single stable position so switching between the dashboard and a
  // notebook never unmounts it (which would reset the running timer/music).
  return (
    <>
      {cloudError && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm text-center py-2 px-4">
          {cloudError}
          <button onClick={() => setCloudError('')} className="ml-3 font-medium underline">
            Dismiss
          </button>
        </div>
      )}
      {mainView}
      <StudySession />
    </>
  )
}
