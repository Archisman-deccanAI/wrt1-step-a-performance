import React from 'react'
import Brand from './Brand'
import ThemeToggle from './ThemeToggle'

export default function Login({ onGoogle, error, theme, onToggleTheme }) {
  return (
    <div className="login">
      <div className="login-topbar">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="login-card">
        <Brand variant="dark" size="lg" />
        <h1>WRT1 Step A Performance</h1>
        <p className="muted">Sign in with your Deccan work account to see your Step B feedback.</p>
        <button className="btn-primary" onClick={onGoogle}>Sign in with Google</button>
        {error && <p className="err">{error}</p>}
        <p className="fine">Only deccanteam.us, teamdeccan.com and deccan.ai accounts can sign in.</p>
      </div>
    </div>
  )
}
