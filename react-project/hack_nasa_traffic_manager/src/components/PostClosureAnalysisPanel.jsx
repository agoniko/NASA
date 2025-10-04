import React from 'react'

export default function PostClosureAnalysisPanel({ onBack, crowdLevel, selectedCount }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <h1 style={{ fontSize:20, fontWeight:600, margin:'0 0 6px 0' }}>Network Impact Analysis</h1>
      <div style={{ fontSize:12.5, color:'#444', marginBottom:14 }}>
        Scenario results based on simulated closure set. (Placeholder — integrate real reroute metrics next.)
      </div>
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        <InfoBadge label="Crowd level" value={crowdLevel} />
        <InfoBadge label="Closed segments" value={selectedCount} />
        <InfoBadge label="Est. network loss" value="—" />
        <InfoBadge label="Avg detour" value="—" />
      </div>
      <section style={{ marginBottom:18 }}>
        <h2 style={{ fontSize:14, margin:'0 0 6px 0', fontWeight:600 }}>Next metrics to implement</h2>
        <ul style={{ margin:0, padding:'0 0 0 16px', fontSize:12 }}>
          <li>Flow redistribution (edge load deltas)</li>
          <li>Bottleneck emergence risk</li>
          <li>Accessibility loss (travel time to key POIs)</li>
          <li>Emergency response path degradation</li>
          <li>Mode shift probability (PT vs private car)</li>
        </ul>
      </section>
      <div style={{ marginTop:'auto', display:'flex', justifyContent:'space-between' }}>
        <button onClick={onBack} style={{ background:'#2563eb', border:'none', color:'#fff', padding:'10px 18px', fontSize:12, borderRadius:6, cursor:'pointer', fontWeight:600 }}>Modify Selection</button>
        <button disabled style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', color:'#64748b', padding:'10px 16px', fontSize:12, borderRadius:6 }}>Export Report (soon)</button>
      </div>
    </div>
  )
}

function InfoBadge({ label, value }) {
  return (
    <div style={{ background:'#f5f5f5', padding:'6px 10px', borderRadius:6, minWidth:110 }}>
      <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:.5, color:'#555', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:600 }}>{value}</div>
    </div>
  )
}
