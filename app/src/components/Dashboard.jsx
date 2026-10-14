import React from 'react'
import KpiCards from './KpiCards'
import CorrectionsTable from './CorrectionsTable'
import MyFlags from './MyFlags'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return s
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

export default function Dashboard({ slice, meta, myFlags, flagsByCorrection, onOpen }) {
  const a = slice.annotator
  const notReviewed = a.step_a_tasks - a.step_b_reviewed

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi {a.name.split(' ')[0]}</h1>
          <p className="muted">Your Step A performance since {fmtDate(meta.window_start)}, based on Step B review.</p>
        </div>
        <div className="asof">As of {fmtDate(meta.as_of)}</div>
      </div>

      <KpiCards a={a} />

      <div className="banner">
        <strong>{notReviewed.toLocaleString()}</strong> of your {a.step_a_tasks.toLocaleString()} tasks are not Step B reviewed yet.
        Step B works through earlier batches, so your most recent work is still being checked. The numbers above cover the {a.step_b_reviewed.toLocaleString()} reviewed so far.
      </div>

      <CorrectionsTable corrections={slice.corrections} flagsByCorrection={flagsByCorrection} onOpen={onOpen} />

      <MyFlags flags={myFlags} />

      <p className="foot">Click any row to open the full task. Error rate counts tasks where Step B changed your label; a correction you flag and we overturn stops counting against you.</p>
    </>
  )
}
