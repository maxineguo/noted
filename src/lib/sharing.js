import { getFirebaseDb } from './firebase'
import { uid, newBlankNotebook } from './storage'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I — avoids ambiguous codes
function randomCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return code
}

// Only Creation (sources) + Learning (lecture, notes, specials, topics) travel with a share —
// Practice history, Chat, and Teach sessions are personal and never leave the original account.
function publicSlice(notebook) {
  return {
    title: notebook.title,
    description: notebook.description || '',
    topics: notebook.topics || [],
    sources: (notebook.sources || []).map((s) => ({ id: s.id, name: s.name, kind: s.kind, meta: s.meta, textContent: s.textContent || null, imageDataUrl: s.imageDataUrl || null, url: s.url || null })),
    lecture: notebook.lecture || null,
    notes: notebook.notes || null,
    specials: notebook.specials || null,
    sharedAt: Date.now(),
  }
}

export async function publishNotebook(notebook) {
  const db = await getFirebaseDb()
  const { doc, setDoc, getDoc } = await import('firebase/firestore')
  let code = notebook.shareCode
  if (!code) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = randomCode()
      const existing = await getDoc(doc(db, 'shared_notebooks', candidate))
      if (!existing.exists()) {
        code = candidate
        break
      }
    }
    if (!code) throw new Error('Could not generate a unique share code — try again.')
  }
  await setDoc(doc(db, 'shared_notebooks', code), publicSlice(notebook))
  return code
}

export async function unpublishNotebook(code) {
  if (!code) return
  const db = await getFirebaseDb()
  const { doc, deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'shared_notebooks', code))
}

export async function redeemShareCode(code) {
  const db = await getFirebaseDb()
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, 'shared_notebooks', code.trim().toUpperCase()))
  if (!snap.exists()) throw new Error("That code doesn't match any shared notebook — double check it and try again.")
  const shared = snap.data()
  const base = newBlankNotebook({ title: shared.title, folder: null, color: 'blue' })
  return {
    ...base,
    id: uid('nb'),
    description: shared.description,
    topics: shared.topics,
    sources: (shared.sources || []).map((s) => ({ ...s, id: uid('src') })),
    lecture: shared.lecture,
    notes: shared.notes,
    specials: shared.specials,
    generated: !!(shared.lecture || shared.notes),
    stageEnabled: { lecture: !!shared.lecture, notes: !!shared.notes, specials: !!shared.specials, practice: false, chat: true, teach: true },
  }
}
