import React, { useState } from 'react'

const REVIEW_NOTE =
  "Flags are reviewed as trainer bandwidth allows, so there is no fixed timeline and they may not be resolved right away. Nothing goes unnoticed though. We go through everything and bring it into calibration sessions."

export default function TaskDetail({ correction, flag, onFlag, onClose }) {
  const c = correction
  const [reason, setReason] = useState('')
  const [showFlag, setShowFlag] = useState(false)
  const changed = c.mismatch === 1
  const canFlag = changed && !flag
  const googleUrl = 'https://www.google.com/search?q=' + encodeURIComponent(c.product_name || c.step_b_label || '')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={onClose} aria-label="Close">&times;</button>

        <div className="detail-grid">
          <div className="detail-img">
            {c.image_url
              ? <img src={c.image_url} alt={c.product_name || 'product'} onError={(e) => { e.currentTarget.style.display = 'none' }} />
              : <div className="noimg">No image</div>}
          </div>
          <div className="detail-info">
            <div className="muted small detail-meta">{[c.prod_type, c.brand].filter(Boolean).join('  ·  ')}</div>
            <h3>{c.product_name || '(no product name)'}</h3>
            {c.description && <p className="detail-desc">{c.description}</p>}
            <div className="detail-links">
              <a href={googleUrl} target="_blank" rel="noreferrer">Search on Google ↗</a>
              <span className="mono small muted">batch {c.batch}</span>
            </div>
          </div>
        </div>

        <div className="detail-labels">
          <div className="lbl">
            <span className="muted small">You labeled</span>
            <div>{c.step_a_label ?? <span className="muted">(blank)</span>}</div>
          </div>
          <div className="lbl-arrow">{changed ? '→' : '='}</div>
          <div className={'lbl' + (changed ? ' lbl-changed' : '')}>
            <span className="muted small">Step B {changed ? 'changed it to' : 'agreed'}</span>
            <div><strong>{c.step_b_label}</strong></div>
          </div>
        </div>

        {flag ? (
          <div className="detail-flagstate">
            {flag.status === 'open'
              ? <span className="pill pending">Flag pending review</span>
              : flag.outcome === 'step_b_overturned'
                ? <span className="pill good">Overturned, you were right</span>
                : <span className="pill bad">Flag upheld</span>}
            {flag.status === 'open' && <p className="review-note">{REVIEW_NOTE}</p>}
          </div>
        ) : canFlag ? (
          !showFlag ? (
            <div className="detail-actions">
              <button className="btn-primary sm" onClick={() => setShowFlag(true)}>Disagree with this correction</button>
            </div>
          ) : (
            <div className="detail-flagform">
              <label className="modal-label">Why do you think your label was right?</label>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Give a short, specific reason a trainer can act on." />
              <p className="review-note">{REVIEW_NOTE}</p>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowFlag(false)}>Cancel</button>
                <button className="btn-primary sm" disabled={reason.trim().length < 5} onClick={() => onFlag(c, reason.trim())}>Submit flag</button>
              </div>
            </div>
          )
        ) : (
          <p className="muted small pad0">Step B agreed with your label here, so there is nothing to flag.</p>
        )}
      </div>
    </div>
  )
}
