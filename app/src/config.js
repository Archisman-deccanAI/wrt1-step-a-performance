// v0 configuration. Dev runs in "seed" mode on bundled sample data.
export const DATA_MODE = import.meta.env.VITE_DATA_MODE || 'seed'

export const ALLOWED_DOMAINS = (import.meta.env.VITE_ALLOWED_DOMAINS || 'deccanteam.us,teamdeccan.com,deccan.ai')
  .split(',').map(s => s.trim()).filter(Boolean)

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export function domainAllowed(email) {
  const d = (email || '').split('@')[1]
  return ALLOWED_DOMAINS.includes(d)
}
