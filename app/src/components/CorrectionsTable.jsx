import React, { useState } from 'react'

function statusCell(c, flag) {
  if (c.mismatch !== 1) return <span className="muted small">view</span>
  if (!flag) return <span className="view-link">Review &rsaquo;</span>
  if (flag.status === 'open') return <span className="pill pending">Flagged</span>
  if (flag.outcome === 'step_b_overturned') return <span className="pill good">Overturned</span>
  return <span className="pill bad">Upheld</span>
}

export default function CorrectionsTable({ corrections, flagsByCorrection, onOpen }) {
  const [filter, setFilter] = useState('changed')
  const changed = corrections.filter((c) => c.mismatch === 1).length
  const rows = corrections.filter((c) => (filter === 'all' ? true : c.mismatch === 1))

  return (
    <section className="corr">
      <div className="corr-head">
        <h2>Your Step B feedback</h2>
        <div className="seg">
          <button className={filter === 'changed' ? 'on' : ''} onClick={() => setFilter('changed')}>Changed ({changed})</button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All reviewed ({corrections.length})</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="muted pad">No reviewed tasks in this sample yet.</p>
      ) : (
        <table className="tbl">
          <thead>
            <tr><th>Date</th><th>Batch</th><th>Your label</th><th>Step B label</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="row-click" onClick={() => onOpen(c)}>
                <td className="nowrap">{c.date}</td>
                <td className="mono">{c.batch}</td>
                <td>{c.step_a_label ?? <span className="muted">(blank)</span>}</td>
                <td>{c.mismatch === 1 ? <strong>{c.step_b_label}</strong> : c.step_b_label}</td>
                <td>{c.mismatch === 1 ? <span className="pill bad">Changed</span> : <span className="pill good">Agreed</span>}</td>
                <td className="num">{statusCell(c, flagsByCorrection[c.id])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
