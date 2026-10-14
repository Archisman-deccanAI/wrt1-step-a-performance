// Flag store. Seed mode uses localStorage so the whole flow works locally.
// Firebase mode writes flags and resolutions to Firestore.
import { DATA_MODE } from './config'

const LS_KEY = 'wrt1_flags_v1'

function devLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch (e) { return [] }
}
function devSave(arr) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(arr)) } catch (e) { /* ignore */ }
}

export async function createFlag({ correction, reason, byEmail }) {
  const flag = {
    correction_id: correction.id,
    annotator_email: correction.email,
    task_id: correction.task_id,
    batch: correction.batch,
    step_a_label: correction.step_a_label,
    step_b_label: correction.step_b_label,
    reason,
    raised_by: byEmail,
    status: 'open',
    created_at: new Date().toISOString(),
    outcome: null, reason_tag: null, note: null, resolved_by: null, resolved_at: null,
  }
  if (DATA_MODE !== 'firebase') {
    const arr = devLoad()
    flag.id = 'flg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    arr.push(flag); devSave(arr)
    return flag
  }
  const { getFb } = await import('./firebase')
  const { collection, addDoc, serverTimestamp } = await import('firebase/firestore')
  const ref = await addDoc(collection(getFb().db, 'flag'), { ...flag, created_at: serverTimestamp() })
  return { ...flag, id: ref.id }
}

export async function listMyFlags(email) {
  if (DATA_MODE !== 'firebase') return devLoad().filter((f) => f.annotator_email === email)
  const { getFb } = await import('./firebase')
  const { collection, query, where, getDocs } = await import('firebase/firestore')
  const snap = await getDocs(query(collection(getFb().db, 'flag'), where('annotator_email', '==', email)))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function listFlags(statusFilter) {
  if (DATA_MODE !== 'firebase') {
    const arr = devLoad()
    return statusFilter ? arr.filter((f) => f.status === statusFilter) : arr
  }
  const { getFb } = await import('./firebase')
  const { collection, query, where, getDocs } = await import('firebase/firestore')
  const col = collection(getFb().db, 'flag')
  const snap = await getDocs(statusFilter ? query(col, where('status', '==', statusFilter)) : col)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function resolveFlag(id, { outcome, reason_tag, note, byEmail }) {
  if (DATA_MODE !== 'firebase') {
    const arr = devLoad()
    const f = arr.find((x) => x.id === id)
    if (f) {
      Object.assign(f, { status: 'resolved', outcome, reason_tag, note: note || '', resolved_by: byEmail, resolved_at: new Date().toISOString() })
      devSave(arr)
    }
    return f
  }
  const { getFb } = await import('./firebase')
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore')
  await updateDoc(doc(getFb().db, 'flag', id), {
    status: 'resolved', outcome, reason_tag, note: note || '', resolved_by: byEmail, resolved_at: serverTimestamp(),
  })
}
