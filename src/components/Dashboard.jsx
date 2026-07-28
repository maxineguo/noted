import { useState, useMemo } from 'react'
import { Search, Plus, Star, Archive, ArchiveRestore, Trash2, X, Folder as FolderIcon, BookOpen, User as UserIcon, ChevronDown, Clock, Pencil, Ticket } from 'lucide-react'
import { newBlankNotebook, colorGradient, FOLDER_COLORS } from '../lib/storage'
import { isFirebaseConfigured } from '../lib/firebase'
import { redeemShareCode } from '../lib/sharing'
import { findAvatarPreset, AvatarSVG } from './avatars.jsx'
import ProfileModal from './ProfileModal.jsx'
import { Modal, Field, inputClass, PrimaryButton, SecondaryButton, EmptyHint } from './ui.jsx'

const TABS = [
  { id: 'library', label: 'Library', icon: BookOpen },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'folders', label: 'Folders', icon: FolderIcon },
]

export default function Dashboard({ user, notebooks, onOpenNotebook, onCreateNotebook, onSaveNotebook, onDeleteNotebook, onLogout, apiKey, onUpdateApiKey, onUpdateAvatar }) {
  const [tab, setTab] = useState('library')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [folderFilter, setFolderFilter] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showRedeem, setShowRedeem] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const folders = useMemo(() => {
    const map = new Map()
    for (const n of notebooks) {
      if (n.folder && !n.archived) map.set(n.folder, (map.get(n.folder) || 0) + 1)
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }))
  }, [notebooks])

  const visible = useMemo(() => {
    let list = notebooks
    if (tab === 'library') list = list.filter((n) => !n.archived)
    else if (tab === 'starred') list = list.filter((n) => n.starred && !n.archived)
    else if (tab === 'archive') list = list.filter((n) => n.archived)
    if (folderFilter) list = list.filter((n) => n.folder === folderFilter)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter((n) => n.title.toLowerCase().includes(q) || (n.description || '').toLowerCase().includes(q) || (n.topics || []).some((t) => t.toLowerCase().includes(q)))
    }
    const sorted = [...list]
    if (sort === 'recent') sorted.sort((a, b) => b.updatedAt - a.updatedAt)
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
    if (sort === 'folder') sorted.sort((a, b) => (a.folder || '\uffff').localeCompare(b.folder || '\uffff'))
    return sorted
  }, [notebooks, tab, folderFilter, query, sort])

  function toggleStar(nb, e) {
    e.stopPropagation()
    onSaveNotebook({ ...nb, starred: !nb.starred })
  }
  function toggleArchive(nb, e) {
    e.stopPropagation()
    onSaveNotebook({ ...nb, archived: !nb.archived })
  }
  function deleteNotebook(nb, e) {
    e.stopPropagation()
    if (window.confirm(`Permanently delete "${nb.title}"? This can't be undone.`)) {
      onDeleteNotebook(nb.id)
    }
  }
  function archiveFolder(name) {
    if (!window.confirm(`Archive all notebooks in "${name}"?`)) return
    notebooks.filter((n) => n.folder === name && !n.archived).forEach((n) => onSaveNotebook({ ...n, archived: true }))
  }
  function deleteFolder(name) {
    if (!window.confirm(`Delete the folder "${name}"? Notebooks inside will stay — they'll just be unfiled.`)) return
    notebooks.filter((n) => n.folder === name).forEach((n) => onSaveNotebook({ ...n, folder: null }))
  }
  function renameFolder(oldName, newName) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    notebooks.filter((n) => n.folder === oldName).forEach((n) => onSaveNotebook({ ...n, folder: trimmed }))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-400 flex items-center justify-center text-white">
              <BookOpen size={16} />
            </div>
            <span className="font-display font-semibold text-lg text-slate-900">Noted</span>
          </div>
          <button onClick={() => setShowProfile(true)} className="w-9 h-9 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-cyan-400 text-white flex items-center justify-center font-medium text-sm ring-2 ring-white shadow hover:shadow-md transition">
            {findAvatarPreset(user.avatarId) ? <AvatarSVG preset={findAvatarPreset(user.avatarId)} size={36} /> : user.name?.[0]?.toUpperCase() || <UserIcon size={16} />}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center gap-1 border-b border-slate-200 mb-8 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                setFolderFilter(null)
              }}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'folders' ? (
          <FoldersView
            folders={folders}
            onOpenFolder={(name) => {
              setFolderFilter(name)
              setTab('library')
            }}
            onArchiveFolder={archiveFolder}
            onDeleteFolder={deleteFolder}
            onRenameFolder={renameFolder}
          />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h1 className="font-display text-3xl font-semibold text-slate-900">{tab === 'starred' ? 'Starred notebooks' : tab === 'archive' ? 'Archive' : 'Your notebooks'}</h1>
                <p className="text-slate-500 mt-1 text-sm">
                  {folderFilter ? (
                    <>
                      In <span className="font-medium text-slate-700">{folderFilter}</span> ·{' '}
                      <button onClick={() => setFolderFilter(null)} className="text-blue-600 hover:underline">
                        clear filter
                      </button>
                    </>
                  ) : tab === 'starred' ? (
                    'Pinned for quick, offline access.'
                  ) : (
                    'Pick up where you left off, or start something new.'
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search library…" className="pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm w-full sm:w-52 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none" />
                </div>
                <div className="relative">
                  <select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none pl-3 pr-8 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer">
                    <option value="recent">Recent</option>
                    <option value="title">Title</option>
                    <option value="folder">Folder</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                {isFirebaseConfigured && (
                  <SecondaryButton onClick={() => setShowRedeem(true)} className="whitespace-nowrap">
                    <Ticket size={16} /> Redeem code
                  </SecondaryButton>
                )}
                <PrimaryButton onClick={() => setShowNew(true)} className="whitespace-nowrap">
                  <Plus size={16} /> New notebook
                </PrimaryButton>
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyLibrary tab={tab} hasQuery={!!query.trim()} onCreate={() => setShowNew(true)} />
            ) : tab === 'archive' && !folderFilter ? (
              <ArchiveGroupedView notebooks={visible} onOpen={onOpenNotebook} onToggleStar={toggleStar} onToggleArchive={toggleArchive} onDelete={deleteNotebook} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {visible.map((nb) => (
                  <NotebookCard key={nb.id} nb={nb} onOpen={() => onOpenNotebook(nb.id)} onToggleStar={(e) => toggleStar(nb, e)} onToggleArchive={(e) => toggleArchive(nb, e)} onDelete={(e) => deleteNotebook(nb, e)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {showNew && (
        <NewNotebookModal
          existingFolders={folders.map((f) => f.name)}
          onClose={() => setShowNew(false)}
          onCreate={(nb) => {
            setShowNew(false)
            onCreateNotebook(nb)
          }}
        />
      )}
      {showRedeem && (
        <RedeemModal
          onClose={() => setShowRedeem(false)}
          onRedeemed={(nb) => {
            setShowRedeem(false)
            onCreateNotebook(nb)
          }}
        />
      )}
      {showProfile && <ProfileModal user={user} apiKey={apiKey} onUpdateApiKey={onUpdateApiKey} onUpdateAvatar={onUpdateAvatar} onLogout={onLogout} onClose={() => setShowProfile(false)} />}
    </div>
  )
}

function RedeemModal({ onClose, onRedeemed }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function redeem() {
    setBusy(true)
    setError('')
    try {
      const nb = await redeemShareCode(code)
      onRedeemed(nb)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Redeem a share code" onClose={onClose}>
      <Field label="Code" hint="Ask whoever shared their notebook for the 6-character code.">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="ABC123"
          className={`${inputClass} text-center font-display text-lg tracking-[0.3em]`}
        />
      </Field>
      {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
      <div className="flex gap-2 mt-5">
        <SecondaryButton onClick={onClose} className="flex-1">
          Cancel
        </SecondaryButton>
        <PrimaryButton onClick={redeem} busy={busy} disabled={code.trim().length < 4} className="flex-1">
          Add to my notebooks
        </PrimaryButton>
      </div>
    </Modal>
  )
}

function NotebookCard({ nb, onOpen, onToggleStar, onToggleArchive, onDelete }) {
  const itemCount = nb.practice ? (nb.practice.concepts?.length || 0) + (nb.practice.vocabulary?.length || 0) + (nb.practice.people?.length || 0) + (nb.practice.formulas?.length || 0) : 0
  const attempted = nb.practiceStats?.attempts || 0
  const masteredPct = attempted ? Math.round((nb.practiceStats.correct / attempted) * 100) : 0

  return (
    <div onClick={onOpen} className="group cursor-pointer rounded-2xl border border-slate-200 bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className={`h-24 bg-gradient-to-br ${colorGradient(nb.color)} relative flex items-start justify-between p-4`}>
        {nb.folder ? (
          <span className="inline-flex items-center gap-1 bg-white/90 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">
            <FolderIcon size={11} /> {nb.folder}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleStar}
            title={nb.starred ? 'Unstar' : 'Star for offline access'}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100 ${nb.starred ? 'bg-white text-amber-500' : 'bg-white/25 text-white hover:bg-white/40'}`}
          >
            <Star size={13} fill={nb.starred ? 'currentColor' : 'none'} />
          </button>
          <button onClick={onToggleArchive} title={nb.archived ? 'Restore' : 'Archive'} className="w-7 h-7 rounded-full bg-white/25 text-white hover:bg-white/40 flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100">
            {nb.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
          </button>
          <button onClick={onDelete} title="Delete permanently" className="w-7 h-7 rounded-full bg-white/25 text-white hover:bg-rose-500 flex items-center justify-center transition opacity-0 group-hover:opacity-100 focus:opacity-100">
            <Trash2 size={13} />
          </button>
        </div>
        <BookOpen size={20} className="absolute bottom-4 left-4 text-white/90" />
      </div>
      <div className="p-4">
        <h3 className="font-display font-semibold text-slate-900 truncate">{nb.title}</h3>
        <p className="text-sm text-slate-500 mt-0.5 truncate">{nb.description || (nb.topics?.length ? nb.topics.join(', ') : 'No sources yet')}</p>
        {nb.generated ? (
          attempted > 0 ? (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-4">
                <span className="flex items-center gap-1">
                  <Clock size={12} /> {itemCount} items
                </span>
                <span>{masteredPct}% mastered</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all" style={{ width: `${masteredPct}%` }} />
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400 mt-4">
              {itemCount} items · not practiced yet
            </p>
          )
        ) : (
          <p className="text-xs text-blue-600 font-medium mt-4">Add sources to get started →</p>
        )}
      </div>
    </div>
  )
}

function ArchiveGroupedView({ notebooks, onOpen, onToggleStar, onToggleArchive, onDelete }) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const n of notebooks) {
      const key = n.folder || 'Unfiled'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(n)
    }
    return Array.from(map.entries())
  }, [notebooks])

  return (
    <div className="space-y-10">
      {groups.map(([folderName, list]) => (
        <div key={folderName}>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            <FolderIcon size={13} /> {folderName}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {list.map((nb) => (
              <NotebookCard key={nb.id} nb={nb} onOpen={() => onOpen(nb.id)} onToggleStar={(e) => onToggleStar(nb, e)} onToggleArchive={(e) => onToggleArchive(nb, e)} onDelete={(e) => onDelete(nb, e)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyLibrary({ tab, hasQuery, onCreate }) {
  if (hasQuery) return <EmptyHint icon={Search} title="No matches" body="Try a different search term." />
  if (tab === 'starred') return <EmptyHint icon={Star} title="Nothing starred yet" body="Star a notebook from the library to pin it here — starred notebooks are confirmed cached for offline use." />
  if (tab === 'archive') return <EmptyHint icon={Archive} title="Archive is empty" body="Notebooks you archive from the library show up here." />
  return (
    <EmptyHint
      icon={BookOpen}
      title="No notebooks yet"
      body="Create your first notebook, add your notes, slides, or textbook pages, and Noted will build your lecture, notes, and practice set from it."
      action={
        <PrimaryButton onClick={onCreate}>
          <Plus size={16} /> New notebook
        </PrimaryButton>
      }
    />
  )
}

function FoldersView({ folders, onOpenFolder, onArchiveFolder, onDeleteFolder, onRenameFolder }) {
  const [editingName, setEditingName] = useState(null)
  const [draft, setDraft] = useState('')

  if (!folders.length) return <EmptyHint icon={FolderIcon} title="No folders yet" body="Give a notebook a folder when you create it to group notebooks for the same class." />

  function startEdit(name) {
    setDraft(name)
    setEditingName(name)
  }
  function commitEdit(oldName) {
    onRenameFolder(oldName, draft)
    setEditingName(null)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {folders.map((f) => (
        <div key={f.name} className="group relative rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md hover:-translate-y-0.5 transition-all">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <FolderIcon size={18} />
          </div>
          {editingName === f.name ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitEdit(f.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit(f.name)
                if (e.key === 'Escape') setEditingName(null)
              }}
              onClick={(e) => e.stopPropagation()}
              className="font-display font-semibold text-slate-900 mt-3 pr-14 border border-blue-300 rounded-lg px-2 py-1 w-full outline-none"
            />
          ) : (
            <button onClick={() => onOpenFolder(f.name)} className="text-left w-full">
              <h3 className="font-display font-semibold text-slate-900 mt-3 pr-14">{f.name}</h3>
              <p className="text-sm text-slate-500">
                {f.count} notebook{f.count === 1 ? '' : 's'}
              </p>
            </button>
          )}
          <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
            <button
              onClick={(e) => {
                e.stopPropagation()
                startEdit(f.name)
              }}
              title="Rename folder"
              className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onArchiveFolder(f.name)
              }}
              title="Archive all notebooks in this folder"
              className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition"
            >
              <Archive size={13} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteFolder(f.name)
              }}
              title="Delete folder (notebooks stay, just unfiled)"
              className="w-7 h-7 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function NewNotebookModal({ existingFolders, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [color, setColor] = useState('blue')

  function submit(e) {
    e.preventDefault()
    if (!title.trim()) return
    const finalFolder = newFolder.trim() || folder || null
    onCreate(newBlankNotebook({ title: title.trim(), folder: finalFolder, color }))
  }

  return (
    <Modal title="New notebook" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AP Bio — Unit 4" className={inputClass} />
        </Field>
        <Field label="Folder (optional)">
          <div className="relative">
            <select
              value={folder}
              onChange={(e) => {
                setFolder(e.target.value)
                setNewFolder('')
              }}
              className={`${inputClass} appearance-none pr-9`}
            >
              <option value="">No folder</option>
              {existingFolders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
          <input
            value={newFolder}
            onChange={(e) => {
              setNewFolder(e.target.value)
              setFolder('')
            }}
            placeholder="or type a new folder name"
            className={`${inputClass} mt-2`}
          />
        </Field>
        <Field label="Color">
          <div className="flex gap-2">
            {FOLDER_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-8 h-8 rounded-full bg-gradient-to-br ${colorGradient(c)} transition ${color === c ? 'ring-2 ring-offset-2 ring-blue-500' : 'opacity-70 hover:opacity-100'}`} aria-label={c} />
            ))}
          </div>
        </Field>
        <div className="flex gap-2 pt-2">
          <SecondaryButton type="button" onClick={onClose} className="flex-1">
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" className="flex-1" disabled={!title.trim()}>
            Create notebook
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  )
}
