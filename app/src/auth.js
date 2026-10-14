// Auth abstraction. Seed mode uses a local mock so the dashboard runs with no
// Firebase project. Firebase mode uses domain-restricted Google sign-in.
import { DATA_MODE, domainAllowed } from './config'

export async function signInWithGoogle() {
  if (DATA_MODE !== 'firebase') {
    throw new Error('Google sign-in is only active in firebase mode')
  }
  const { GoogleAuthProvider, signInWithPopup, signOut } = await import('firebase/auth')
  const { getFb } = await import('./firebase')
  const { auth } = getFb()
  const provider = new GoogleAuthProvider()
  const res = await signInWithPopup(auth, provider)
  const email = res.user.email || ''
  if (!domainAllowed(email)) {
    await signOut(auth)
    throw new Error('Only Deccan work accounts can sign in to this app.')
  }
  return { email, name: res.user.displayName || email }
}

export async function subscribeAuth(cb) {
  if (DATA_MODE !== 'firebase') return () => {}
  const { onAuthStateChanged } = await import('firebase/auth')
  const { getFb } = await import('./firebase')
  const { auth } = getFb()
  return onAuthStateChanged(auth, (u) => {
    if (u && domainAllowed(u.email)) cb({ email: u.email, name: u.displayName || u.email })
    else cb(null)
  })
}

export async function signOutUser() {
  if (DATA_MODE !== 'firebase') return
  const { signOut } = await import('firebase/auth')
  const { getFb } = await import('./firebase')
  await signOut(getFb().auth)
}
