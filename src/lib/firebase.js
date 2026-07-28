// Fill in your own Firebase project's config to enable cross-device sync (see README's
// "Cross-device sync with Firebase" section for exact setup steps). Until you do, Noted keeps
// working exactly as before — everything just stays local to this browser (see storage.js).
//
// These read from Vite env vars (a .env file, or your host's environment variable settings) so
// you never have to commit real keys to the repo. Copy .env.example to .env and fill it in.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = !!(config.apiKey && config.projectId)

let appInstance = null
let authInstance = null
let dbInstance = null
let storageInstance = null

// Lazy-loaded so the ~70KB Firebase SDK never even downloads for anyone running local-only.
async function ensureInitialized() {
  if (!isFirebaseConfigured) return null
  if (appInstance) return appInstance
  const { initializeApp } = await import('firebase/app')
  appInstance = initializeApp(config)
  return appInstance
}

export async function getFirebaseAuth() {
  if (!isFirebaseConfigured) return null
  await ensureInitialized()
  if (!authInstance) {
    const { getAuth } = await import('firebase/auth')
    authInstance = getAuth(appInstance)
  }
  return authInstance
}

export async function getFirebaseDb() {
  if (!isFirebaseConfigured) return null
  await ensureInitialized()
  if (!dbInstance) {
    const { getFirestore } = await import('firebase/firestore')
    dbInstance = getFirestore(appInstance)
  }
  return dbInstance
}

export async function getFirebaseStorage() {
  if (!isFirebaseConfigured) return null
  await ensureInitialized()
  if (!storageInstance) {
    const { getStorage } = await import('firebase/storage')
    storageInstance = getStorage(appInstance)
  }
  return storageInstance
}
