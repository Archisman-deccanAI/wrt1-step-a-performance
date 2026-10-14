import React from 'react'
import Brand from './Brand'
import ThemeToggle from './ThemeToggle'

export default function Layout({
  user, role, view, setView, demo, demoRole, setDemoRole,
  annotators, currentEmail, onDemoSwitch, onSignOut, children,
  theme, onToggleTheme,
}) {
  const showDash = role === 'annotator'
  const showStaff = role === 'trainer' || role === 'viewer'
  const queueLabel = role === 'trainer' ? 'Trainer queue' : 'Flag queue'

  return (
    <div className="page">
      <header className="topbar">
        <div className="tb-left">
          <Brand variant="light" />
          <span className="tb-divider" />
          <span className="tb-title">WRT1 Step A Performance</span>
          <nav className="nav">
            {showDash && <button className={view === 'dashboard' ? 'navon' : ''} onClick={() => setView('dashboard')}>My dashboard</button>}
            {showStaff && <button className={view === 'queue' ? 'navon' : ''} onClick={() => setView('queue')}>{queueLabel}</button>}
            {showStaff && <button className={view === 'analytics' ? 'navon' : ''} onClick={() => setView('analytics')}>Analytics</button>}
            {showStaff && <button className={view === 'coaching' ? 'navon' : ''} onClick={() => setView('coaching')}>Coaching</button>}
          </nav>
        </div>
        <div className="tb-right">
          {role === 'viewer' && <span className="role-tag">View only</span>}
          {demo && (
            <>
              <label className="demo-switch">
                <span className="demo-tag">DEMO</span>
                <select value={demoRole} onChange={(e) => setDemoRole(e.target.value)}>
                  <option value="annotator">Annotator</option>
                  <option value="trainer">Trainer</option>
                  <option value="viewer">Viewer (deccan.ai)</option>
                </select>
              </label>
              {view === 'dashboard' && (
                <select className="who-select" value={currentEmail} onChange={(e) => onDemoSwitch(e.target.value)}>
                  {annotators.map((x) => <option key={x.email} value={x.email}>{x.name}</option>)}
                </select>
              )}
            </>
          )}
          <span className="whoami">{user?.name}</span>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          {!demo && <button className="btn-ghost" onClick={onSignOut}>Sign out</button>}
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}
