import { getFirebaseDb, getFirebaseStorage } from './firebase'

// Firestore documents cap out at 1MB, and a notebook with several generated illustrations
// would blow past that in base64 alone — so images live in Cloud Storage instead, and the
// Firestore document just holds their download URL (same shape either way, so the rest of the
// app never has to know or care which backend is active).
async function uploadDataUrlIfNeeded(storage, path, dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl
  const { ref, uploadString, getDownloadURL } = await import('firebase/storage')
  const storageRef = ref(storage, path)
  await uploadString(storageRef, dataUrl, 'data_url')
  return getDownloadURL(storageRef)
}

async function offloadImagesToStorage(uid, notebook, storage) {
  const nb = { ...notebook }
  if (nb.lecture?.images?.length) {
    const images = await Promise.all(
      nb.lecture.images.map(async (img, i) => ({ ...img, dataUrl: await uploadDataUrlIfNeeded(storage, `users/${uid}/notebooks/${nb.id}/lecture-image-${i}.jpg`, img.dataUrl) })),
    )
    nb.lecture = { ...nb.lecture, images }
  }
  if (nb.specials?.graphImages?.length) {
    const graphImages = await Promise.all(
      nb.specials.graphImages.map(async (img, i) => ({ ...img, dataUrl: await uploadDataUrlIfNeeded(storage, `users/${uid}/notebooks/${nb.id}/graph-image-${i}.jpg`, img.dataUrl) })),
    )
    nb.specials = { ...nb.specials, graphImages }
  }
  if (nb.sources?.some((s) => s.imageDataUrl?.startsWith('data:'))) {
    const sources = await Promise.all(
      nb.sources.map(async (s) => (s.imageDataUrl?.startsWith('data:') ? { ...s, imageDataUrl: await uploadDataUrlIfNeeded(storage, `users/${uid}/notebooks/${nb.id}/source-${s.id}.jpg`, s.imageDataUrl) } : s)),
    )
    nb.sources = sources
  }
  return nb
}

function friendlyCloudError(e) {
  const msg = String(e?.message || e)
  if (/longer than.*1.*mb|exceeds.*maximum|invalid-argument/i.test(msg)) return "This notebook is too large to sync (likely from very long notes) — it's still saved on this device, just not synced yet."
  if (/permission-denied/i.test(msg)) return 'Permission denied — check your Firestore security rules (see README).'
  if (/unavailable|network/i.test(msg)) return 'Could not reach the server — check your connection. Changes are kept locally and will sync once reconnected.'
  return msg
}

export async function subscribeNotebooksCloud(uid, onChange, onError) {
  const db = await getFirebaseDb()
  const { collection, onSnapshot } = await import('firebase/firestore')
  return onSnapshot(
    collection(db, 'users', uid, 'notebooks'),
    (snap) => onChange(snap.docs.map((d) => d.data())),
    (e) => onError?.(friendlyCloudError(e)),
  )
}

export async function saveNotebookCloud(uid, notebook) {
  const db = await getFirebaseDb()
  const storage = await getFirebaseStorage()
  const { doc, setDoc } = await import('firebase/firestore')
  try {
    const prepared = await offloadImagesToStorage(uid, notebook, storage)
    const next = { ...prepared, updatedAt: Date.now() }
    await setDoc(doc(db, 'users', uid, 'notebooks', notebook.id), next)
    return next
  } catch (e) {
    throw new Error(friendlyCloudError(e))
  }
}

export async function deleteNotebookCloud(uid, id) {
  const db = await getFirebaseDb()
  const { doc, deleteDoc } = await import('firebase/firestore')
  await deleteDoc(doc(db, 'users', uid, 'notebooks', id))
}

// User profile (API key + avatar) — same real-time-sync treatment so switching devices carries
// your key and picture with you too.
export async function subscribeUserProfileCloud(uid, onChange) {
  const db = await getFirebaseDb()
  const { doc, onSnapshot } = await import('firebase/firestore')
  return onSnapshot(doc(db, 'users', uid, 'profile', 'main'), (snap) => onChange(snap.exists() ? snap.data() : {}))
}

export async function updateUserProfileCloud(uid, patch) {
  const db = await getFirebaseDb()
  const { doc, setDoc } = await import('firebase/firestore')
  await setDoc(doc(db, 'users', uid, 'profile', 'main'), patch, { merge: true })
}
