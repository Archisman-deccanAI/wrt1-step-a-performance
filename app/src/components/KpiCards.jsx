import React from 'react'
import { fmtAht } from '../data'

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'kpi' + (tone ? ' ' + tone : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

export default function KpiCards({ a }) {
  const errTone = a.err_pct >= 20 ? 'bad' : a.err_pct >= 14 ? 'warn' : 'good'
  return (
    <div className="kpis">
      <Kpi
        label="Step B error rate"
        value={a.err_pct + '%'}
        sub={a.step_b_mismatches.toLocaleString() + ' changed of ' + a.step_b_reviewed.toLocaleString() + ' reviewed'}
        tone={errTone}
      />
      <Kpi
        label="Step B coverage"
        value={a.step_b_coverage_pct + '%'}
        sub={a.step_b_reviewed.toLocaleString() + ' of ' + a.step_a_tasks.toLocaleString() + ' tasks reviewed'}
      />
      <Kpi label="Avg handling time" value={fmtAht(a.avg_aht_mins)} sub="per task" />
      <Kpi label="Tasks annotated" value={a.step_a_tasks.toLocaleString()} sub="in this window" />
    </div>
  )
}
