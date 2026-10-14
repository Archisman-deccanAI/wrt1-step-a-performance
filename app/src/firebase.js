// Firebase is initialised lazily and only in "firebase" data mode,
// so the app runs in seed mode without any Firebase config present.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { firebaseConfig } from './config'

let cached = null
export function getFb() {
  if (!cached) {
    const app = initializeApp(firebaseConfig)
    cached = { app, auth: getAuth(app), db: getFirestore(app) }
  }
  return cached
}
