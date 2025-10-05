import React from 'react'

// Shared color function for percentage change evaluation
function changeColor(row) {
  const { change, better } = row
  if (better === 'depends') return '#6366f1'
  if (change > 3) {
    if (better === 'higher') return '#16a34a'
    return '#dc2626'
  }
  if (change < -3) {
    if (better === 'higher') return '#dc2626'
    return '#16a34a'
  }
  return '#d97706'
}

export default function PostClosureAnalysisPanel({ onBack, crowdLevel, selectedCount, results, onOptimize, optimizing }) {
  const rows = React.useMemo(() => {
    if (!results) return []
    const { before, after } = results
    const defs = [
  { key:'avgTravelTimeMin', label:'Average travel time', unit:'min', better:'lower' },
  { key:'avgQueueTimeMin', label:'Average queue/wait', unit:'min', better:'lower' },
  { key:'avgSpeedKmh', label:'Average speed change', unit:'km/h', better:'higher' },
      { key:'vkt', label:'Vehicle Kilometres Traveled (VKT)', unit:'km', scale: (v)=> v/1000, decimals:1, better:'depends' },
      { key:'vht', label:'Vehicle Hours Traveled (VHT)', unit:'h', scale: (v)=> v/3600, decimals:1, better:'lower' },
      { key:'pm25', label:'PM2.5', unit:'µg/m³', better:'lower' },
      { key:'o3', label:'O3', unit:'ppb', better:'lower' },
      { key:'no2', label:'NO2', unit:'ppb', better:'lower' },
      { key:'pm10', label:'PM10', unit:'µg/m³', better:'lower' }
    ]
    return defs.map(d => {
      let b = before[d.key]
      let a = after[d.key]
      if (d.scale) { b = d.scale(b); a = d.scale(a) }
      const change = ((a - b) / (b === 0 ? 1 : b)) * 100
      return { ...d, before: b, after: a, change }
    })
  }, [results])

  function format(val, decimals=2) {
    if (val == null || isNaN(val)) return '—'
    return Number(val).toFixed(decimals)
  }

  // changeColor now defined at module scope

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <h1 style={{ fontSize:20, fontWeight:600, margin:'0 0 6px 0' }}>Network Impact Analysis</h1>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
        <InfoBadge label="Crowd level" value={crowdLevel} />
        <InfoBadge label="Closed segments" value={selectedCount} />
        {results && <InfoBadge label="Generated" value={new Date(results.generatedAt).toLocaleTimeString()} />}
      </div>
      <section style={{ marginBottom:18, flex:1, display:'flex', flexDirection:'column' }}>
        {results && <ImpactOverview rows={rows} />}
  <h2 style={{ fontSize:14, margin:'18px 0 10px 0', fontWeight:600 }}>Before / After Comparison</h2>
        {!results && (
          <div style={{ padding:14, fontSize:12, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8 }}>
            No results yet. Run the simulation.
          </div>
        )}
        {results && (
          <>
            <div style={{ overflowY:'auto', border:'1px solid #e5e7eb', borderRadius:8 }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead style={{ background:'#f1f5f9' }}>
                  <tr>
                    <th style={thStyle}>Metric</th>
                    <th style={thStyle}>Before</th>
                    <th style={thStyle}>After</th>
                    <th style={thStyle}>Δ %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.key} style={{ borderTop:'1px solid #f1f5f9' }}>
                      <td style={tdLeft}>{r.label}</td>
                      <td style={td}>{format(r.before, r.decimals ?? 2)} {r.unit}</td>
                      <td style={td}>{format(r.after, r.decimals ?? 2)} {r.unit}</td>
                      <td style={{ ...td, fontWeight:600, color: changeColor(r) }}>{(r.change>=0?'+':'') + format(r.change, 1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div style={{ fontSize:10.5, color:'#555', marginTop:8, lineHeight:1.4 }}>
          Δ% colors: green = improvement, red = worse, orange = minor change (&lt;3%), purple = context-dependent (neutral).
        </div>
      </section>
      <div style={{ marginTop:'auto', display:'flex', justifyContent:'space-between', gap:12 }}>
        <button onClick={onBack} disabled={optimizing} style={{ background: optimizing? '#94a3b8':'#2563eb', border:'none', color:'#fff', padding:'10px 18px', fontSize:12, borderRadius:6, cursor: optimizing? 'default':'pointer', fontWeight:600 }}>Modify Selection</button>
        <button onClick={() => { if (!optimizing && onOptimize) onOptimize() }} disabled={optimizing} style={{ background: optimizing? '#d1d5db':'linear-gradient(90deg,#059669,#10b981)', border: optimizing? '1px solid #cbd5e1':'none', color: optimizing? '#64748b':'#fff', padding:'10px 18px', fontSize:12, borderRadius:30, cursor: optimizing? 'default':'pointer', fontWeight:600, minWidth:170, boxShadow: optimizing? 'none':'0 4px 14px -4px rgba(16,185,129,0.55)' }}>
          {optimizing ? 'Optimizing…' : 'Optimize traffic flow'}
        </button>
      </div>
    </div>
  )
}

const thStyle = { padding:'8px 10px', textAlign:'left', fontSize:11, fontWeight:600, letterSpacing:.3, borderBottom:'1px solid #e2e8f0' }
const td = { padding:'6px 10px', fontSize:11.5 }
const tdLeft = { ...td, fontWeight:500 }

function InfoBadge({ label, value }) {
  return (
    <div style={{ background:'#f5f5f5', padding:'6px 10px', borderRadius:6, minWidth:110 }}>
      <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:.5, color:'#555', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:600 }}>{value}</div>
    </div>
  )
}

function ImpactOverview({ rows }) {
  // Build radar-style polygon for quick multi-metric glance
  const keys = ['avgTravelTimeMin','avgSpeedKmh','vkt','vht','pm25','no2']
  const selected = rows.filter(r => keys.includes(r.key))
  if (!selected.length) return null
  // Determine score similarly to previous logic
  const weightMap = { avgTravelTimeMin:0.24, avgSpeedKmh:0.20, vkt:0.12, vht:0.22, pm25:0.10, no2:0.12 }
  let score=0
  selected.forEach(c=>{ const w=weightMap[c.key]||0; if(c.better==='higher') score+=w * (-c.change); else if(c.better==='lower') score+=w * (c.change*-1); else score+=w * (-Math.abs(c.change)*0.25) })
  const normalizedScore = Math.max(0, Math.min(100, 55 + score))
  let scoreColor = '#16a34a'; if (normalizedScore < 35) scoreColor='#dc2626'; else if (normalizedScore < 55) scoreColor='#f59e0b'; else if (normalizedScore < 70) scoreColor='#0ea5e9'
  // Normalize each metric (use after for shape of impact) – for higher-is-better invert so polygon shrink means worse
  const normalized = selected.map(m => {
    let base = m.after
    // Simple normalization using (after / before) ratio clipped
    const ratio = m.before === 0 ? 1 : base / m.before
    let val
    if (m.better === 'lower') {
      // if increase >1 -> worse; we want 1/ratio so improvement (ratio<1) -> >1 value
      val = 1/ratio
    } else if (m.better === 'higher') {
      val = ratio
    } else {
      val = 1 - Math.min(1, Math.abs(ratio-1))
    }
    // cap and rescale to 0..1.4 then clamp to 0..1
    val = Math.max(0, Math.min(1, (val - 0.6) / 0.8))
    return { key:m.key, label:m.label, val }
  })
  const cx=55, cy=55, R=42
  const angleStep = (Math.PI*2)/normalized.length
  const points = normalized.map((p,i)=>{
    const ang = -Math.PI/2 + i*angleStep
    const r = R * p.val
    return [cx + Math.cos(ang)*r, cy + Math.sin(ang)*r]
  })
  const polygon = points.map(pt=>pt.join(',')).join(' ')

  return (
    <div style={{ display:'flex', gap:18, padding:'14px 16px', border:'1px solid #e5e7eb', borderRadius:12, background:'#f8fafc' }}>
      <div style={{ flex:'0 0 120px', textAlign:'center', display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:.5, color:'#475569', textTransform:'uppercase' }}>Impact Score</div>
        <div style={{ fontSize:38, fontWeight:700, color:scoreColor, lineHeight:1 }}>{normalizedScore.toFixed(0)}</div>
        <div style={{ fontSize:10, letterSpacing:.5, color:'#64748b' }}>/100</div>
  <div style={{ fontSize:10.5, color:'#475569', marginTop:6, lineHeight:1.3 }}>Assesses overall closure effects on time, traffic and emissions.</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Radar Impatto (After vs Before)</div>
        <svg viewBox="0 0 110 110" width="100%" height="160" style={{ overflow:'visible' }}>
          {/* grid */}
          {[0.25,0.5,0.75,1].map(g=>{
            const r = R * g
            return <circle key={g} cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={0.6} />
          })}
          {points.map((pt,i)=>{
            const next = points[(i+1)%points.length]
            return <line key={i} x1={cx} y1={cy} x2={pt[0]} y2={pt[1]} stroke="#e2e8f0" strokeWidth={0.6} />
          })}
          <polygon points={polygon} fill="rgba(37,99,235,0.35)" stroke="#2563eb" strokeWidth={1.2} />
          {points.map((pt,i)=>{
            const m = normalized[i]
            return (
              <g key={m.key}>
                <circle cx={pt[0]} cy={pt[1]} r={2.3} fill="#2563eb" />
                <text x={pt[0]} y={pt[1]-4} fontSize={4} textAnchor="middle" fill="#1e3a8a">{Math.round(m.val*100)}%</text>
              </g>
            )
          })}
          {normalized.map((m,i)=>{
            const ang = -Math.PI/2 + i*angleStep
            const labelR = R + 10
            const lx = cx + Math.cos(ang)*labelR
            const ly = cy + Math.sin(ang)*labelR
            return <text key={m.key} x={lx} y={ly} fontSize={4.2} textAnchor="middle" fill="#475569">{shortLabel(m.label)}</text>
          })}
        </svg>
  <div style={{ fontSize:10, color:'#64748b', lineHeight:1.3 }}>Larger polygon = better normalized post-closure performance.</div>
      </div>
    </div>
  )
}

function shortLabel(label) {
  return label
  .replace('Average travel time','Travel')
  .replace('Average speed change','Speed')
  .replace('Vehicle Kilometres Traveled (VKT)','VKT')
  .replace('Vehicle Hours Traveled (VHT)','VHT')
  .replace('Average queue/wait','Queue')
}
