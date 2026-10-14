import React, { useState } from 'react'

export default function FlagModal({ correction, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const canSubmit = reason.trim().length >= 5

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Disagree with this correction</h3>
        <div className="modal-corr">
          <div>
            <span className="muted">Your label</span>
            <div>{correction.step_a_label ?? '(blank)'}</div>
          </div>
          <div className="arrow">&rarr;</div>
          <div>
            <span className="muted">Step B changed it to</span>
            <div><strong>{correction.step_b_label}</strong></div>
          </div>
        </div>
        <label className="modal-label">Why do you think your label was right?</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Give a short, specific reason a trainer can act on."
        />
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary sm" disabled={!canSubmit} onClick={() => onSubmit(reason.trim())}>Submit flag</button>
        </div>
      </div>
    </div>
  )
}
