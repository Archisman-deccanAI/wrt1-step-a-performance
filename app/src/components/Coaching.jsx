import React, { useMemo, useState } from 'react'

// Membership threshold: a person needs at least this many errors on a pair
// before we'd pull them into a refresher for it. Below this is noise.
const COHORT_MIN = 5

function shade(n, max) {
  if (!n) return 'transparent'
  const t = Math.min(1, n / max)
  // light -> deep indigo
  const l = 95 - Math.round(t * 55)
  return `hsl(243 70% ${l}%)`
}

export default function Coaching({ agg }) {
  const pairs = agg?.pairs || []
  const rows = agg?.rows || []
  const [selected, setSelected] = useState(0)

  const model = useMemo(() => {
    const pairTotals = pairs.map((_, i) => rows.reduce((s, r) => s + (r.c[i] || 0), 0))
    const annTotals = rows.map((r) => r.c.reduce((s, n) => s + n, 0))
    const cellMax = Math.max(1, ...rows.flatMap((r) => r.c))
    const pairMax = Math.max(1, ...pairTotals)

    // ranked pairs (hotspots)
    const ranked = pairs
      .map((p, i) => ({ i, ...p, total: pairTotals[i] }))
      .sort((a, b) => b.total - a.total)

    // cohort for a given pair index
    const cohortFor = (i) =>
      rows
        .map((r) => ({ name: r.name, n: r.c[i] || 0 }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)

    // annotators ranked by total confusion, for the heatmap order
    const heatRows = rows
      .map((r, ri) => ({ ...r, total: annTotals[ri] }))
      .sort((a, b) => b.total - a.total)

    return { pairTotals, annTotals, cellMax, pairMax, ranked, cohortFor, heatRows }
  }, [pairs, rows])

  if (!pairs.length) {
    return (
      <>
        <div className="page-head"><div><h1>Coaching</h1></div></div>
        <p className="muted pad">No confusion data yet. This fills in once Step B markings accumulate.</p>
      </>
    )
  }

  const sel = model.ranked.find((r) => r.i === selected) || model.ranked[0]
  const selIdx = sel.i
  const cohort = model.cohortFor(selIdx)
  const core = cohort.filter((x) => x.n >= COHORT_MIN)
  const occasional = cohort.filter((x) => x.n < COHORT_MIN)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Coaching</h1>
          <p className="muted">Where Step A and Step B disagree on the taxonomy, grouped so you can pull the right people into one refresher. Based on Step B markings only, not HLQA or client (RCA).</p>
        </div>
      </div>

      <div className="coach-grid">
        <section className="corr">
          <div className="corr-head">
            <h2>Confusion hotspots</h2>
            <span className="muted sm">pick one to see who to coach</span>
          </div>
          <div className="hotspots">
            {model.ranked.map((p) => {
              const n = model.cohortFor(p.i).filter((x) => x.n >= COHORT_MIN).length
              return (
                <button
                  key={p.i}
                  className={'hotspot' + (p.i === selIdx ? ' on' : '')}
                  onClick={() => setSelected(p.i)}
                >
                  <div className="hs-pair">
                    <span className="hs-from">{p.f}</span>
                    <span className="hs-arrow">→</span>
                    <span className="hs-to">{p.t}</span>
                  </div>
                  <div className="hs-track">
                    <div className="hs-fill" style={{ width: (100 * p.total / model.pairMax) + '%' }} />
                  </div>
                  <div className="hs-meta">
                    <span className="hs-total">{p.total}</span>
                    <span className="hs-people">{n} to coach</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="corr">
          <div className="corr-head"><h2>Refresher cohort</h2></div>
          <div className="cohort-pair">
            <span className="hs-from">{sel.f}</span>
            <span className="hs-arrow">→</span>
            <span className="hs-to">{sel.t}</span>
          </div>
          <p className="muted sm pad-x">
            {core.length
              ? `${core.length} ${core.length === 1 ? 'person' : 'people'} confuse these repeatedly (${COHORT_MIN}+ times). Run one session with this group.`
              : `No one crosses the ${COHORT_MIN}-error line on this pair yet, so it is scattered rather than a group problem.`}
          </p>

          {core.length > 0 && (
            <div className="cohort-list">
              {core.map((x) => {
                const w = 100 * x.n / Math.max(1, core[0].n)
                return (
                  <div className="cohort-row" key={x.name}>
                    <div className="cohort-name">{x.name}</div>
                    <div className="cohort-track"><div className="cohort-fill" style={{ width: w + '%' }} /></div>
                    <div className="cohort-n">{x.n}</div>
                  </div>
                )
              })}
            </div>
          )}

          {occasional.length > 0 && (
            <div className="cohort-also">
              <span className="muted sm">Also seen occasionally: </span>
              {occasional.map((x) => (
                <span className="chip-sm" key={x.name}>{x.name} <b>{x.n}</b></span>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="corr">
        <div className="corr-head">
          <h2>Error matrix</h2>
          <span className="muted sm">rows are annotators, columns are confusion pairs. Darker means more.</span>
        </div>
        <div className="heat-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th className="heat-corner">Annotator</th>
                {model.ranked.map((p) => (
                  <th
                    key={p.i}
                    className={'heat-col' + (p.i === selIdx ? ' on' : '')}
                    title={`${p.f} → ${p.t}`}
                    onClick={() => setSelected(p.i)}
                  >
                    <span className="heat-col-label">{p.f} → {p.t}</span>
                  </th>
                ))}
                <th className="heat-tot">Total</th>
              </tr>
            </thead>
            <tbody>
              {model.heatRows.map((r) => (
                <tr key={r.name}>
                  <td className="heat-name">{r.name}</td>
                  {model.ranked.map((p) => {
                    const n = r.c[p.i] || 0
                    const deep = n / model.cellMax > 0.55
                    return (
                      <td
                        key={p.i}
                        className={'heat-cell' + (p.i === selIdx ? ' col-on' : '')}
                        style={{ background: shade(n, model.cellMax), color: deep ? '#fff' : '#1f2430' }}
                        title={`${r.name}: ${n} on ${p.f} → ${p.t}`}
                      >
                        {n || ''}
                      </td>
                    )
                  })}
                  <td className="heat-tot">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="foot">Counts are Step A labels that Step B changed, over the current window. A high total for one person is an individual coaching candidate; a tall column is a taxonomy worth a group refresher. Flags that get overturned are genuine Step A calls, so once flag outcomes feed back in, treat these as provisional.</p>
    </>
  )
}
