// All persistence for Noted lives in the browser (localStorage) by default. See firestore.js /
// auth.js for the optional Firebase-backed cross-device layer — this file remains the
// single-device fallback and defines the shared notebook shape both layers use.

const K = {
  users: 'noted:users',
  session: 'noted:session',
  notebooks: (uid) => `noted:notebooks:${uid}`,
  apiKey: (uid) => `noted:apikey:${uid}`,
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (e) {
    console.error('Storage write failed', e)
    return false
  }
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ---------- Auth (local-only demo auth, see README — or use auth.js for Firebase) ----------

export function getUsers() {
  return read(K.users, [])
}

export function findUserByEmail(email) {
  return getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase())
}

export function createUser({ name, email, password }) {
  const users = getUsers()
  if (findUserByEmail(email)) throw new Error('An account with that email already exists.')
  const user = { id: uid('user'), name, email, password, avatarId: null, createdAt: Date.now() }
  write(K.users, [...users, user])
  return user
}

export function verifyLogin(email, password) {
  const user = findUserByEmail(email)
  if (!user || user.password !== password) return null
  return user
}

export function setSession(userId) {
  write(K.session, { userId })
}
export function getSession() {
  const s = read(K.session, null)
  if (!s) return null
  return getUsers().find((u) => u.id === s.userId) || null
}
export function clearSession() {
  localStorage.removeItem(K.session)
}

export function updateUserAvatar(userId, avatarId) {
  const users = getUsers().map((u) => (u.id === userId ? { ...u, avatarId } : u))
  write(K.users, users)
  return users.find((u) => u.id === userId)
}

// ---------- Gemini API key ----------

export function getApiKey(userId) {
  return read(K.apiKey(userId), '')
}
export function setApiKey(userId, key) {
  write(K.apiKey(userId), key || '')
}

// ---------- Notebooks ----------
// Fresh accounts start with zero notebooks. Nothing is generated until the user adds their
// own sources in Creation and runs "Generate study materials".

export function getNotebooks(userId) {
  return read(K.notebooks(userId), [])
}
export function saveNotebooks(userId, notebooks) {
  write(K.notebooks(userId), notebooks)
}
export function upsertNotebook(userId, notebook) {
  const notebooks = getNotebooks(userId)
  const idx = notebooks.findIndex((n) => n.id === notebook.id)
  const next = { ...notebook, updatedAt: Date.now() }
  if (idx === -1) notebooks.unshift(next)
  else notebooks[idx] = next
  saveNotebooks(userId, notebooks)
  return next
}
export function getNotebook(userId, id) {
  return getNotebooks(userId).find((n) => n.id === id) || null
}
export function deleteNotebookForever(userId, id) {
  saveNotebooks(userId, getNotebooks(userId).filter((n) => n.id !== id))
}

// Every non-Creation stage can be individually toggled off via the "Customize" generation
// picker — an unchecked stage's tab locks until the user opts back in and it lazily generates.
export function defaultStageEnabled() {
  return { lecture: true, notes: true, specials: true, practice: true, chat: true, teach: true }
}

export function newBlankNotebook({ title, folder, color }) {
  const now = Date.now()
  return {
    id: uid('nb'),
    title: title || 'Untitled notebook',
    description: '',
    folder: folder || null,
    color: color || 'blue',
    createdAt: now,
    updatedAt: now,
    archived: false,
    starred: false,
    sources: [],
    topics: [],
    generated: false,
    stageEnabled: defaultStageEnabled(),
    lecture: null, // { chapters: [{ title, script, questions:[{fraction,question}] }], images: [{chapterIndex,caption,dataUrl}] }
    notes: null, // { topics: [{ id, title, mainIdea, detailed }], reviewPrompts: [] } — detailed is generated lazily per-topic
    specials: null, // built up lazily, piece by piece: { mindmap, timeline, chart, graphs, graphImages, custom: [] }
    practice: null, // { concepts, vocabulary, people, formulas, problems, application }
    practiceStats: { attempts: 0, correct: 0, history: [] },
    chat: [],
    teachTopics: [], // [{ label, done }]
    teachSessions: [],
    shareCode: null, // set once the notebook has been made public for sharing (see sharing.js)
  }
}

export function renameNotebook(userId, id, title) {
  const nb = getNotebook(userId, id)
  if (!nb) return null
  return upsertNotebook(userId, { ...nb, title })
}

// Renames a folder across every notebook that has it (folders are just a string field, not a
// separate entity, so "renaming" means a bulk update).
export function renameFolder(userId, oldName, newName) {
  const notebooks = getNotebooks(userId).map((n) => (n.folder === oldName ? { ...n, folder: newName, updatedAt: Date.now() } : n))
  saveNotebooks(userId, notebooks)
}

export function archiveFolder(userId, folderName, archived = true) {
  const notebooks = getNotebooks(userId).map((n) => (n.folder === folderName ? { ...n, archived, updatedAt: Date.now() } : n))
  saveNotebooks(userId, notebooks)
}

// Blue-forward accent palette for notebook cards / folders. "blue" is the default.
export const FOLDER_COLORS = ['blue', 'cyan', 'teal', 'indigo', 'amber', 'rose']

export function colorGradient(color) {
  const map = {
    blue: 'from-blue-500 to-blue-700',
    cyan: 'from-cyan-400 to-blue-600',
    teal: 'from-teal-400 to-emerald-600',
    indigo: 'from-indigo-500 to-blue-800',
    amber: 'from-amber-400 to-orange-600',
    rose: 'from-rose-400 to-pink-600',
  }
  return map[color] || map.blue
}
