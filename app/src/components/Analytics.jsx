import React from 'react'
import { fmtAht } from '../data'

function round1(n) { return Math.round(n * 10) / 10 }
function tone(err) { return err >= 20 ? 'bad' : err >= 14 ? 'warn' : 'good' }

export default function Analytics({ annotators, flags }) {
  const resolved = flags.filter((f) => f.status === 'resolved')
  const overturned = resolved.filter((f) => f.outcome === 'step_b_overturned')
  const openCount = flags.filter((f) => f.status === 'open').length

  const otByEmail = {}
  for (const f of overturned) otByEmail[f.annotator_email] = (otByEmail[f.annotator_email] || 0) + 1
  const flagsByEmail = {}
  for (const f of flags) flagsByEmail[f.annotator_email] = (flagsByEmail[f.annotator_email] || 0) + 1

  const rows = annotators.map((a) => {
    const ot = otByEmail[a.email] || 0
    const adjM = Math.max(0, a.step_b_mismatches - ot)
    const adjErr = a.step_b_reviewed ? round1((100 * adjM) / a.step_b_reviewed) : 0
    return { ...a, flags: flagsByEmail[a.email] || 0, overturned: ot, adj_err: adjErr }
  }).sort((x, y) => y.err_pct - x.err_pct)

  const totalTasks = annotators.reduce((s, a) => s + a.step_a_tasks, 0)
  const totalReviewed = annotators.reduce((s, a) => s + a.step_b_reviewed, 0)
  const totalMis = annotators.reduce((s, a) => s + a.step_b_mismatches, 0)
  const teamErr = totalReviewed ? round1((100 * totalMis) / totalReviewed) : 0
  const teamCov = totalTasks ? round1((100 * totalReviewed) / totalTasks) : 0
  const overturnRate = resolved.length ? round1((100 * overturned.length) / resolved.length) : 0

  const tagCounts = {}
  for (const f of resolved) if (f.reason_tag) tagCounts[f.reason_tag] = (tagCounts[f.reason_tag] || 0) + 1
  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])
  const maxTag = Math.max(1, ...tags.map((t) => t[1]))
  const maxErr = Math.max(1, ...rows.map((r) => r.err_pct))

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team analytics</h1>
          <p className="muted">Step A (Hyderabad) quality measured against Step B review only, with flag outcomes folded in. It does not include HLQA or client (RCA) review.</p>
        </div>
      </div>

      <div className="kpis kpis-5">
        <div className="kpi"><div className="kpi-label">Step B error rate</div><div className="kpi-value">{teamErr}%</div><div className="kpi-sub">{totalMis.toLocaleString()} changed by Step B of {totalReviewed.toLocaleString()}</div></div>
        <div className="kpi"><div className="kpi-label">Coverage</div><div className="kpi-value">{teamCov}%</div><div className="kpi-sub">{totalReviewed.toLocaleString()} of {totalTasks.toLocaleString()}</div></div>
        <div className="kpi"><div className="kpi-label">Annotators</div><div className="kpi-value">{annotators.length}</div><div className="kpi-sub">in this window</div></div>
        <div className="kpi"><div className="kpi-label">Open flags</div><div className="kpi-value">{openCount}</div><div className="kpi-sub">awaiting a trainer</div></div>
        <div className="kpi"><div className="kpi-label">Overturn rate</div><div className="kpi-value">{overturnRate}%</div><div className="kpi-sub">{overturned.length} of {resolved.length} resolved</div></div>
      </div>

      <div className="grid2">
        <section className="corr">
          <div className="corr-head"><h2>Step B error rate by annotator</h2></div>
          <div className="bars">
            {rows.map((r) => (
              <div className="bar-row" key={r.email}>
                <div className="bar-name" title={r.name}>{r.name}</div>
                <div className="bar-track"><div className={'bar-fill ' + tone(r.err_pct)} style={{ width: (100 * r.err_pct / maxErr) + '%' }} /></div>
                <div className="bar-val">{r.err_pct}%</div>
              </div>
            ))}
          </div>
        </section>

        <section className="corr">
          <div className="corr-head"><h2>Flags resolved by reason</h2></div>
          {tags.length === 0 ? (
            <p className="muted pad">No resolved flags yet. Reason tags appear here as trainers resolve flags, building the error taxonomy.</p>
          ) : (
            <div className="bars">
              {tags.map(([tag, n]) => (
                <div className="bar-row" key={tag}>
                  <div className="bar-name wide" title={tag}>{tag}</div>
                  <div className="bar-track"><div className="bar-fill blue" style={{ width: (100 * n / maxTag) + '%' }} /></div>
                  <div className="bar-val">{n}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="corr">
        <div className="corr-head"><h2>Per-annotator detail</h2></div>
        <table className="tbl">
          <thead>
            <tr><th>Annotator</th><th className="num">Tasks</th><th className="num">Reviewed</th><th className="num">Coverage</th><th className="num">Error</th><th className="num">Flags</th><th className="num">Overturned</th><th className="num">Adj. error</th><th className="num">AHT</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.email}>
                <td className="nowrap">{r.name}</td>
                <td className="num">{r.step_a_tasks.toLocaleString()}</td>
                <td className="num">{r.step_b_reviewed.toLocaleString()}</td>
                <td className="num">{r.step_b_coverage_pct}%</td>
                <td className="num"><span className={'dot ' + tone(r.err_pct)} />{r.err_pct}%</td>
                <td className="num">{r.flags || ''}</td>
                <td className="num">{r.overturned || ''}</td>
                <td className="num">{r.adj_err}%</td>
                <td className="num">{fmtAht(r.avg_aht_mins)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="foot">Adjusted error removes corrections that were flagged and overturned. As more flags resolve, this is the number to coach against, since it reflects true Step A errors rather than Step B mistakes.</p>
    </>
  )
}
