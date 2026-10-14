// Data layer. Seed mode reads bundled sample JSON; firebase mode reads Firestore.
import { DATA_MODE } from './config'
import annotators from './seed/annotators.json'
import corrections from './seed/corrections.json'
import reasonTags from './seed/reason_tags.json'
import meta from './seed/meta.json'
import trainerAgg from './seed/trainer_agg.json'

// Stable id for a correction row (used to attach flags to it).
export function correctionId(c) {
  return [c.email, c.task_id, c.step_a_label, c.step_b_label].join('|')
}

export function getReasonTags() { return reasonTags }

export async function getMeta() {
  if (DATA_MODE === 'seed') return meta
  const { getFb } = await import('./firebase')
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(getFb().db, 'meta', 'current'))
  return snap.exists() ? snap.data() : meta
}

// Returns { annotator, corrections } for one person, or null if not found.
export async function getMySlice(email) {
  if (DATA_MODE === 'seed') {
    const annotator = annotators.find((a) => a.email === email) || null
    if (!annotator) return null
    const corr = corrections.filter((c) => c.email === email).map((c) => ({ ...c, id: correctionId(c) }))
    return { annotator, corrections: corr }
  }
  const { getFb } = await import('./firebase')
  const { doc, getDoc } = await import('firebase/firestore')
  const { db } = getFb()
  const sliceSnap = await getDoc(doc(db, 'metric_slice', email))
  if (!sliceSnap.exists()) return null
  // One bundle doc per annotator holds all their Step B feedback rows.
  const bundleSnap = await getDoc(doc(db, 'correction_bundle', email))
  const rows = bundleSnap.exists() ? (bundleSnap.data().rows || []) : []
  const corr = rows
    .map((r) => { const c = { email, ...r }; return { id: correctionId(c), ...c } })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  return { annotator: sliceSnap.data(), corrections: corr }
}

// Role for a signed-in user (firebase mode). Seed mode handles role via the UI toggle.
export async function getRole(email) {
  if (DATA_MODE === 'seed') return 'annotator'
  const { getFb } = await import('./firebase')
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(getFb().db, 'app_user', email))
  if (snap.exists() && ['trainer', 'admin'].includes(snap.data().role)) return 'trainer'
  if ((email || '').toLowerCase().endsWith('@deccan.ai')) return 'viewer'
  return 'annotator'
}

export async function getAllAnnotators() {
  if (DATA_MODE === 'seed') return annotators.filter((a) => !a.excluded)
  const { getFb } = await import('./firebase')
  const { collection, getDocs } = await import('firebase/firestore')
  const snap = await getDocs(collection(getFb().db, 'metric_slice'))
  return snap.docs.map((d) => d.data()).filter((a) => !a.excluded)
}

export function listSeedAnnotators() {
  return annotators.filter((a) => !a.excluded).sort((a, b) => a.name.localeCompare(b.name))
}

export function fmtAht(mins) {
  if (mins == null || isNaN(Number(mins))) return '-'
  const total = Math.round(Number(mins) * 60)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m ? `${m}m ${s}s` : `${s}s`
}

export function nameFor(email) {
  const a = annotators.find((x) => x.email === email)
  return a ? a.name : email
}

// Confusion aggregate for the trainer coaching view.
// seed mode: bundled JSON. firebase mode: /agg/trainer doc.
export async function getTrainerAgg() {
  if (DATA_MODE === 'seed') return trainerAgg
  const { getFb } = await import('./firebase')
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(getFb().db, 'agg', 'trainer'))
  return snap.exists() ? snap.data() : trainerAgg
}
