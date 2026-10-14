import React, { useEffect, useState, useCallback } from 'react'
import { DATA_MODE } from './config'
import { subscribeAuth, signInWithGoogle, signOutUser } from './auth'
import { getMySlice, getMeta, getRole, getAllAnnotators, getTrainerAgg, listSeedAnnotators, nameFor } from './data'
import { createFlag, listMyFlags, listFlags, resolveFlag } from './store'
import Login from './components/Login'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import TrainerQueue from './components/TrainerQueue'
import Analytics from './components/Analytics'
import Coaching from './components/Coaching'
import TaskDetail from './components/TaskDetail'

const DEMO_DEFAULT = 'kamisetti.venkatarajesh@deccanteam.us'

export default function App() {
  const [user, setUser] = useState(null)
  const [demoRole, setDemoRole] = useState('annotator')
  const [role, setRole] = useState('annotator')
  const [view, setView] = useState('dashboard')
  const [slice, setSlice] = useState(null)
  const [meta, setMeta] = useState(null)
  const [myFlags, setMyFlags] = useState([])
  const [allFlags, setAllFlags] = useState([])
  const [allAnnotators, setAllAnnotators] = useState([])
  const [agg, setAgg] = useState(null)
  const [detailTarget, setDetailTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'light' } catch { return 'light' }
  })

  // apply theme to the document root so it covers the login screen too
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch {}
  }, [theme])
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  // auth
  useEffect(() => {
    let unsub = () => {}
    if (DATA_MODE === 'firebase') {
      subscribeAuth((u) => {
        setUser(u)
        if (u) getRole(u.email).then(setRole)
      }).then((fn) => { unsub = fn })
    } else {
      setUser({ email: DEMO_DEFAULT, name: nameFor(DEMO_DEFAULT) })
    }
    return () => unsub()
  }, [])

  // dev role follows the demo toggle
  useEffect(() => { if (DATA_MODE === 'seed') setRole(demoRole) }, [demoRole])

  // land on the right default view for the role
  useEffect(() => { setView(role === 'annotator' ? 'dashboard' : 'analytics') }, [role])

  useEffect(() => { getMeta().then(setMeta) }, [])

  // load slice for the current dashboard subject
  useEffect(() => {
    if (!user) { setSlice(null); setLoading(false); return }
    setLoading(true)
    getMySlice(user.email).then((s) => { setSlice(s); setLoading(false) })
  }, [user])

  const reloadFlags = useCallback(async () => {
    if (!user) return
    setMyFlags(await listMyFlags(user.email))
    if (role === 'trainer' || role === 'viewer') {
      setAllFlags(await listFlags())
      setAllAnnotators(await getAllAnnotators())
      setAgg(await getTrainerAgg())
    }
  }, [user, role])

  useEffect(() => { reloadFlags() }, [reloadFlags])

  const onDemoSwitch = (email) => setUser({ email, name: nameFor(email) })
  const onGoogle = async () => {
    setAuthError('')
    try { setUser(await signInWithGoogle()) } catch (e) { setAuthError(e.message) }
  }
  const onSignOut = async () => { await signOutUser(); setUser(null) }

  const onFlagSubmit = async (correction, reason) => {
    await createFlag({ correction, reason, byEmail: user.email })
    setDetailTarget(null)
    reloadFlags()
  }
  const onResolve = async (flag, outcome, tag) => {
    await resolveFlag(flag.id, { outcome, reason_tag: tag, byEmail: user.email })
    reloadFlags()
  }

  if (!user) return <Login onGoogle={onGoogle} error={authError} theme={theme} onToggleTheme={toggleTheme} />
  if (loading || !meta) return <div className="center muted">Loading…</div>

  const flagsByCorrection = {}
  for (const f of myFlags) flagsByCorrection[f.correction_id] = f
  const openFlags = allFlags.filter((f) => f.status === 'open')
  const resolvedFlags = allFlags.filter((f) => f.status === 'resolved')

  return (
    <Layout
      user={user} role={role} view={view} setView={setView}
      demo={DATA_MODE === 'seed'} demoRole={demoRole} setDemoRole={setDemoRole}
      annotators={DATA_MODE === 'seed' ? listSeedAnnotators() : []}
      currentEmail={user.email} onDemoSwitch={onDemoSwitch} onSignOut={onSignOut}
      theme={theme} onToggleTheme={toggleTheme}
    >
      {view === 'coaching' && (role === 'trainer' || role === 'viewer') ? (
        <Coaching agg={agg} />
      ) : view === 'analytics' && (role === 'trainer' || role === 'viewer') ? (
        <Analytics annotators={allAnnotators} flags={allFlags} />
      ) : view === 'queue' && (role === 'trainer' || role === 'viewer') ? (
        <TrainerQueue open={openFlags} resolved={resolvedFlags} onResolve={onResolve} readOnly={role !== 'trainer'} />
      ) : slice ? (
        <Dashboard
          slice={slice} meta={meta} myFlags={myFlags}
          flagsByCorrection={flagsByCorrection} onOpen={setDetailTarget}
        />
      ) : (
        <div className="muted pad">No data found for {user.email}. Ask a trainer to add you to the identity map.</div>
      )}

      {detailTarget && (
        <TaskDetail
          correction={detailTarget}
          flag={flagsByCorrection[detailTarget.id]}
          onFlag={onFlagSubmit}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </Layout>
  )
}
