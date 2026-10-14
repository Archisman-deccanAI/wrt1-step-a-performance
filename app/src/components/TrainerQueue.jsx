import React, { useState } from 'react'
import { getReasonTags, nameFor } from '../data'

function ResolveRow({ f, onResolve, readOnly }) {
  const [tag, setTag] = useState('')
  const tags = getReasonTags()
  return (
    <tr>
      <td className="nowrap">{nameFor(f.annotator_email)}</td>
      <td>
        {f.step_a_label ?? <span className="muted">(blank)</span>} <span className="muted">&rarr;</span> <strong>{f.step_b_label}</strong>
      </td>
      <td className="reason">{f.reason}</td>
      {readOnly ? (
        <td colSpan={2}><span className="pill pending">Open</span></td>
      ) : (
        <>
          <td>
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">reason tag…</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </td>
          <td className="resolve-actions">
            <button className="btn-upheld" disabled={!tag} onClick={() => onResolve(f, 'error_upheld', tag)}>Uphold</button>
            <button className="btn-overturn" disabled={!tag} onClick={() => onResolve(f, 'step_b_overturned', tag)}>Overturn</button>
          </td>
        </>
      )}
    </tr>
  )
}

export default function TrainerQueue({ open, resolved, onResolve, readOnly }) {
  const [tab, setTab] = useState('open')
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{readOnly ? 'Flag queue' : 'Trainer queue'}</h1>
          <p className="muted">
            {readOnly
              ? 'Flags raised by Step A annotators and their outcomes. Read-only.'
              : 'Flags raised by Step A annotators. Resolve each with a reason tag; overturned ones stop counting against the annotator.'}
          </p>
        </div>
      </div>
      <section className="corr">
        <div className="corr-head">
          <h2>Flags</h2>
          <div className="seg">
            <button className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>Open ({open.length})</button>
            <button className={tab === 'resolved' ? 'on' : ''} onClick={() => setTab('resolved')}>Resolved ({resolved.length})</button>
          </div>
        </div>

        {tab === 'open' ? (
          open.length === 0 ? (
            <p className="muted pad">No open flags. Nice and quiet.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Annotator</th><th>Correction</th><th>Their reason</th><th>Reason tag</th><th>Decision</th></tr>
              </thead>
              <tbody>{open.map((f) => <ResolveRow key={f.id} f={f} onResolve={onResolve} readOnly={readOnly} />)}</tbody>
            </table>
          )
        ) : (
          resolved.length === 0 ? (
            <p className="muted pad">Nothing resolved yet.</p>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Annotator</th><th>Correction</th><th>Outcome</th><th>Reason tag</th></tr>
              </thead>
              <tbody>
                {resolved.map((f) => (
                  <tr key={f.id}>
                    <td className="nowrap">{nameFor(f.annotator_email)}</td>
                    <td>{f.step_a_label ?? <span className="muted">(blank)</span>} <span className="muted">&rarr;</span> {f.step_b_label}</td>
                    <td>{f.outcome === 'step_b_overturned' ? <span className="pill good">Overturned</span> : <span className="pill bad">Upheld</span>}</td>
                    <td>{f.reason_tag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </section>
    </>
  )
}
