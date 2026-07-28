import { getFirebaseAuth, isFirebaseConfigured } from './firebase'

export { isFirebaseConfigured }

export async function cloudSignUp({ name, email, password }) {
  const auth = await getFirebaseAuth()
  const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth')
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(cred.user, { displayName: name })
  return cred.user
}

export async function cloudSignIn({ email, password }) {
  const auth = await getFirebaseAuth()
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function cloudSignOut() {
  const auth = await getFirebaseAuth()
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
}

// Fires immediately with the current user (or null), then again on every sign-in/out — this is
// what lets the app "just know" you're logged in on a new device without you doing anything.
export async function onCloudAuthChange(callback) {
  const auth = await getFirebaseAuth()
  if (!auth) {
    callback(null)
    return () => {}
  }
  const { onAuthStateChanged } = await import('firebase/auth')
  return onAuthStateChanged(auth, callback)
}

export function friendlyAuthError(e) {
  const code = e?.code || ''
  if (code.includes('email-already-in-use')) return 'An account with that email already exists.'
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'No account matches that email and password.'
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.'
  if (code.includes('invalid-email')) return 'That email address looks invalid.'
  if (code.includes('network-request-failed')) return 'Could not reach the server — check your connection.'
  return e?.message || 'Something went wrong signing you in.'
}
