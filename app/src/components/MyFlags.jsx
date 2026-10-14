import React from 'react'

function statusCell(f) {
  if (f.status === 'open') return <span className="pill pending">Pending review</span>
  if (f.outcome === 'step_b_overturned') return <span className="pill good">Overturned, you were right</span>
  return <span className="pill bad">Upheld</span>
}

export default function MyFlags({ flags }) {
  if (!flags || flags.length === 0) return null
  const anyOpen = flags.some((f) => f.status === 'open')
  return (
    <section className="corr myflags">
      <div className="corr-head"><h2>Your flags</h2></div>
      <table className="tbl">
        <thead>
          <tr><th>Raised</th><th>Your label</th><th>Step B label</th><th>Status</th></tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.id}>
              <td className="nowrap">{(f.created_at || '').slice(0, 10)}</td>
              <td>{f.step_a_label ?? <span className="muted">(blank)</span>}</td>
              <td>{f.step_b_label}</td>
              <td>{statusCell(f)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {anyOpen && (
        <p className="review-note pad">
          Flags are reviewed as trainer bandwidth allows, so there is no fixed timeline and they may not be resolved right away. Nothing goes unnoticed though. We go through everything and bring it into calibration sessions.
        </p>
      )}
    </section>
  )
}
