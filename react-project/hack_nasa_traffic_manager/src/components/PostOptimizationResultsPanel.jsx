import React from 'react'

// Metric configuration (same keys as previous panel but comparing pre-opt (beforeOpt) vs optimized)
const METRICS = [
  { key:'avgTravelTimeMin', label:'Avg travel time', unit:'min', better:'lower' },
  { key:'avgDelayMin', label:'Avg delay', unit:'min', better:'lower' },
  { key:'maxDelayMin', label:'Max delay', unit:'min', better:'lower' },
  { key:'avgQueueTimeMin', label:'Queue time', unit:'min', better:'lower' },
  { key:'avgSpeedKmh', label:'Avg speed', unit:'km/h', better:'higher' },
  { key:'vkt', label:'VKT', unit:'km', scale:v=>v/1000, decimals:1, better:'depends' },
  { key:'vht', label:'VHT', unit:'h', scale:v=>v/3600, decimals:1, better:'lower' },
  { key:'pm25', label:'PM2.5', unit:'µg/m³', better:'lower' },
  { key:'o3', label:'O3', unit:'ppb', better:'lower' },
  { key:'no2', label:'NO2', unit:'ppb', better:'lower' },
  { key:'pm10', label:'PM10', unit:'µg/m³', better:'lower' }
]

export default function PostOptimizationResultsPanel({ baseResults, optimization, onBackToAnalysis }) {
  if (!optimization || !baseResults) return (
    <div style={{ padding:20 }}>
      <h2 style={{ fontSize:18, margin:0 }}>No optimization data</h2>
      <p style={{ fontSize:12 }}>Run optimization to view improvements.</p>
      <button onClick={onBackToAnalysis} style={btnPrimary}>Back</button>
    </div>
  )

  // baseResults.after is the network after closures, which is the baseline for optimization
  const beforeOpt = optimization.before // should equal baseResults.after
  const afterOpt = optimization.after

  const NEUTRAL_THRESHOLD_PCT = 0.4
  const rows = METRICS.map(m => {
    let b = beforeOpt[m.key]
    let a = afterOpt[m.key]
    if (m.scale) { b = m.scale(b); a = m.scale(a) }
    const delta = a - b
    const pct = ((a - b) / (b === 0 ? 1 : b)) * 100
    const improved = Math.abs(pct) >= NEUTRAL_THRESHOLD_PCT && isImproved(m.better, b, a)
    const neutral = Math.abs(pct) < NEUTRAL_THRESHOLD_PCT
    const worsened = Math.abs(pct) >= NEUTRAL_THRESHOLD_PCT && !improved && pct !== 0
    return { ...m, before:b, after:a, delta, pct, improved, neutral, worsened }
  })

  const improvedCount = rows.filter(r => r.improved).length
  const worsenedCount = rows.filter(r => r.worsened).length
  const neutralCount = rows.filter(r => r.neutral).length

  // Build optimization score (simple weighted positive improvement - negative impact)
  let score = 52
  rows.forEach(r => {
    const magnitude = Math.min(12, Math.abs(r.pct))
    if (r.improved) score += magnitude * 0.55
    else if (r.worsened) score -= magnitude * 0.75
    else if (r.neutral) score -= 0.15
  })
  score = Math.max(0, Math.min(100, score))
  let scoreColor = '#16a34a'; if (score < 40) scoreColor='#dc2626'; else if (score < 55) scoreColor='#f59e0b'; else if (score < 70) scoreColor='#0ea5e9'

  const emissionKeys = ['pm25','no2','pm10']
  const emissionBefore = sum(emissionKeys.map(k => beforeOpt[k]||0))
  const emissionAfter = sum(emissionKeys.map(k => afterOpt[k]||0))
  const emissionChangePct = ((emissionAfter - emissionBefore)/(emissionBefore||1))*100

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
      <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
        <h1 style={{ fontSize:20, fontWeight:600, margin:'0 0 4px 0' }}>Optimized Traffic Flow Dashboard</h1>
        <div style={{ fontSize:12.5, color:'#475569', marginBottom:12 }}>
          Signal timing & adaptive re-routing applied to mitigate closure impact. Small but meaningful improvements are highlighted.
        </div>
        {/* Scrollable analytics section (keeps footer visible) */}
  <div style={{ flex:1, minHeight:0, overflowY:'auto', overflowX:'hidden', paddingRight:2 }}>
          <TopSummary score={score} scoreColor={scoreColor} improved={improvedCount} worsened={worsenedCount} neutral={neutralCount} emissionChangePct={emissionChangePct} />
          <div style={{ display:'flex', gap:16, flexWrap:'wrap', margin:'14px 0 12px 0' }}>
            {rows.filter(r=>['avgTravelTimeMin','avgDelayMin','avgSpeedKmh','avgQueueTimeMin'].includes(r.key)).map(r => (
              <MiniImprovementCard key={r.key} row={r} />
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:16, minHeight:0, width:'100%', maxWidth:'100%' }}>
            {/* Radar FIRST */}
            <div style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:12, padding:12, background:'#ffffff', display:'flex', flexDirection:'column', minHeight:0, maxWidth:'100%', overflow:'hidden' }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Performance Radar</div>
              <div style={{ fontSize:10.5, color:'#64748b', marginBottom:6 }}>Green polygon shows optimized performance relative to pre-optimization (grey).</div>
              <div style={{ flex:1, minHeight:0, display:'flex', alignItems:'center', justifyContent:'center', width:'100%' }}>
                <div style={{ width:'100%', maxWidth:380 }}>
                  <Radar before={beforeOpt} after={afterOpt} />
                </div>
              </div>
            </div>
            {/* Table SECOND */}
            <div style={{ flex:'1 1 auto', width:'100%', minWidth:0, border:'1px solid #e2e8f0', borderRadius:12, padding:12, background:'#f8fafc', display:'flex', flexDirection:'column', maxHeight:'100%', minHeight:0 }}>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:8 }}>Metric Improvements</div>
              <div style={{ overflowY:'auto', flex:1, overscrollBehavior:'contain' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed', fontSize:11, lineHeight:1.25 }}>
                  <colgroup>
                    <col style={{ width:'34%' }} />
                    <col style={{ width:'15%' }} />
                    <col style={{ width:'15%' }} />
                    <col style={{ width:'11%' }} />
                    <col style={{ width:'15%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background:'#f1f5f9', textAlign:'left' }}>
                      <th style={th}>Metric</th>
                      <th style={th}>Pre</th>
                      <th style={th}>Opt</th>
                      <th style={th}>Δ</th>
                      <th style={th}>Δ %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key} style={{ borderTop:'1px solid #eef2f7', background: r.improved? '#f0fdf4' : (r.worsened? '#fef2f2' : 'transparent') }}>
                        <td style={tdLeft}>{r.label}</td>
                        <td style={td}>{fmt(r.before, r.decimals)} {r.unit}</td>
                        <td style={{ ...td, fontWeight:600 }}>{fmt(r.after, r.decimals)} {r.unit}</td>
                        <td style={td}>{sign(r.delta)}{fmt(Math.abs(r.delta), r.decimals)}</td>
                        <td style={{ ...td, fontWeight:600, color: r.improved ? '#059669' : (r.worsened ? '#dc2626' : '#64748b') }}>{sign(r.pct)}{fmt(Math.abs(r.pct),1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize:10.5, color:'#555', marginTop:6 }}>Green = improvement; Red = worse; Gray = negligible (&lt;{NEUTRAL_THRESHOLD_PCT}%).</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ paddingTop:12, display:'flex', justifyContent:'space-between', gap:14 }}>
        <button onClick={onBackToAnalysis} style={{ background:'#334155', border:'none', color:'#fff', padding:'10px 16px', fontSize:12, borderRadius:6, cursor:'pointer', fontWeight:600 }}>Back to Impact View</button>
        <button disabled style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', color:'#64748b', padding:'10px 18px', fontSize:12, borderRadius:6 }}>Export Report (soon)</button>
      </div>
    </div>
  )
}

function isImproved(better, before, after) {
  if (better === 'higher') return after > before
  if (better === 'lower') return after < before
  return Math.abs(after - before) < Math.abs(before) // for depends treat smaller magnitude change as improvement
}
function sum(arr){ return arr.reduce((a,b)=>a+b,0) }
function sign(v){ if (v===0) return ''; return v>0?'+':'-'}
function fmt(v, d=2){ if (v==null || isNaN(v)) return '—'; return Number(v).toFixed(d) }

// Summary header
function TopSummary({ score, scoreColor, improved, worsened, neutral, emissionChangePct }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:14 }}>
      <div style={cardMini}>
        <div style={miniLabel}>Optimization Score</div>
        <div style={{ fontSize:34, fontWeight:700, color:scoreColor, lineHeight:1 }}>{score.toFixed(0)}</div>
        <div style={{ fontSize:10, letterSpacing:.5, color:'#475569' }}>/100</div>
      </div>
      <div style={cardMini}>
        <div style={miniLabel}>Metric Outcomes</div>
        <div style={{ display:'flex', gap:12, fontSize:11, marginTop:4 }}>
          <span style={{ color:'#059669', fontWeight:600 }}>{improved} improved</span>
          <span style={{ color:'#dc2626', fontWeight:600 }}>{worsened} worsened</span>
          <span style={{ color:'#64748b', fontWeight:600 }}>{neutral} neutral</span>
        </div>
      </div>
      <div style={cardMini}>
        <div style={miniLabel}>Aggregate Emissions</div>
        <div style={{ fontSize:14, fontWeight:600, color: emissionChangePct < 0 ? '#059669':'#dc2626', marginTop:4 }}>{sign(emissionChangePct)}{fmt(Math.abs(emissionChangePct),1)}%</div>
        <div style={{ fontSize:10, color:'#64748b' }}>PM2.5 + NO2 + PM10</div>
      </div>
    </div>
  )
}

function MiniImprovementCard({ row }) {
  const pct = row.pct
  const improved = row.improved
  const barPct = Math.min(100, Math.abs(pct))
  const barColor = improved ? 'linear-gradient(90deg,#047857,#059669)' : 'linear-gradient(90deg,#dc2626,#b91c1c)'
  return (
    <div style={{ flex:'1 1 160px', minWidth:150, background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 12px' }}>
      <div style={{ fontSize:11, fontWeight:600, color:'#475569' }}>{row.label}</div>
      <div style={{ fontSize:10, color:'#64748b', marginBottom:4 }}>{fmt(row.before,row.decimals)} → <strong>{fmt(row.after,row.decimals)}</strong> {row.unit}</div>
      <div style={{ position:'relative', height:8, background:'#f1f5f9', borderRadius:6, overflow:'hidden' }}>
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:barPct+'%', background:barColor, opacity:.85, transition:'width .3s' }} />
      </div>
      <div style={{ fontSize:11, fontWeight:600, marginTop:4, color: improved? '#047857':'#b91c1c' }}>{improved? 'Improved':'Worse'} {sign(Math.abs(pct))}{fmt(Math.abs(pct),1)}%</div>
    </div>
  )
}

function Radar({ before, after }) {
  const keys = ['avgTravelTimeMin','avgDelayMin','avgQueueTimeMin','avgSpeedKmh','vht','pm25','no2']
  const metrics = keys.map(k => ({ key:k, before: before[k], after: after[k], better: METRICS.find(m=>m.key===k)?.better || 'lower' }))
  // Normalize: improvement -> higher radial value
  const norm = metrics.map(m => {
    let ratio
    if (m.better === 'higher') ratio = (after[m.key] || 0) / (before[m.key] || 1)
    else if (m.better === 'lower') ratio = (before[m.key] || 0) / (after[m.key] || 1)
    else ratio = 1 - Math.min(1, Math.abs((after[m.key]-before[m.key])/(before[m.key]||1))*0.5)
    let val = ratio
    val = Math.max(0, Math.min(1.4, val)) // cap
    val = (val - 0.6) / 0.8
    val = Math.max(0, Math.min(1, val))
    return { key:m.key, val }
  })
  const size = 170
  const cx = size/2
  const cy = size/2
  const R = (size/2) - 18
  const angle = (i)=> -Math.PI/2 + i*(2*Math.PI/norm.length)
  const beforePoints = norm.map((p,i)=>{ const r = R*0.75; return [cx+Math.cos(angle(i))*r, cy+Math.sin(angle(i))*r] })
  const afterPoints = norm.map((p,i)=>{ const r = R*p.val; return [cx+Math.cos(angle(i))*r, cy+Math.sin(angle(i))*r] })
  const toStr = pts => pts.map(pt=>pt.join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width='100%' height={size} style={{ maxWidth:300 }}>
      {[0.25,0.5,0.75,1].map(g=> <circle key={g} cx={cx} cy={cy} r={R*g} fill='none' stroke='#e2e8f0' strokeWidth={0.6} />)}
      {norm.map((_,i)=>(<line key={i} x1={cx} y1={cy} x2={cx+Math.cos(angle(i))*R} y2={cy+Math.sin(angle(i))*R} stroke='#e2e8f0' strokeWidth={0.6} />))}
      <polygon points={toStr(beforePoints)} fill='rgba(100,116,139,0.25)' stroke='#64748b' strokeWidth={1} />
      <polygon points={toStr(afterPoints)} fill='rgba(16,185,129,0.35)' stroke='#059669' strokeWidth={1.4} />
      {norm.map((p,i)=>{
        const px = afterPoints[i][0]; const py = afterPoints[i][1]
        return <circle key={p.key} cx={px} cy={py} r={2.2} fill='#059669' />
      })}
      {norm.map((p,i)=>{
        const ang = angle(i)
        const lx = cx + Math.cos(ang)*(R+10)
        const ly = cy + Math.sin(ang)*(R+10)
        return <text key={p.key} x={lx} y={ly} fontSize={8} textAnchor='middle' fill='#475569'>{shortLabel(p.key)}</text>
      })}
    </svg>
  )
}

function shortLabel(k){
  switch(k){
    case 'avgTravelTimeMin': return 'Travel time'
    case 'avgDelayMin': return 'Delay'
    case 'avgQueueTimeMin': return 'Queue'
    case 'avgSpeedKmh': return 'Speed'
    case 'vht': return 'VHT'
    case 'pm25': return 'PM2.5'
    case 'no2': return 'NO2'
    default: return k
  }
}

// Shared styles
const th = { padding:'6px 8px', fontSize:10.5, fontWeight:600, letterSpacing:.4 }
const td = { padding:'5px 8px', fontSize:11 }
const tdLeft = { ...td, fontWeight:500 }
const btnPrimary = { background:'#2563eb', border:'none', color:'#fff', padding:'8px 14px', fontSize:12, borderRadius:6, cursor:'pointer', fontWeight:600 }
const cardMini = { background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:12, padding:'10px 14px', flex:'0 0 160px', display:'flex', flexDirection:'column', justifyContent:'center' }
const miniLabel = { fontSize:10, textTransform:'uppercase', letterSpacing:.6, color:'#64748b', fontWeight:600 }

