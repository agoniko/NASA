import React from 'react'

/**
 * PostOptimizationResultsPanel
 * Placeholder component to host final optimized scenario analytics.
 * Props:
 *  - baseResults: original simulation results (after initial closures) { before, after }
 *  - optimization: optimizationResults { before, after }
 *  - onBackToAnalysis: callback to return to previous panel
 */
export default function PostOptimizationResultsPanel({ baseResults, optimization, onBackToAnalysis }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <h1 style={{ fontSize:20, fontWeight:600, margin:'0 0 6px 0' }}>Optimization Outcome (Prototype)</h1>
      <div style={{ fontSize:12.5, color:'#444', marginBottom:14 }}>
        This panel will display advanced re-routing KPIs, signal adjustments, and emission deltas after optimization. (Placeholder)
      </div>
      <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:14, fontSize:12.5, lineHeight:1.5 }}>
        <strong>Status:</strong> Prototype placeholder. Integration coming next.<br/>
        {optimization && (
          <>
            <div style={{ marginTop:10 }}><strong>Improved Metrics Preview:</strong></div>
            <ul style={{ margin:'6px 0 0 16px', padding:0 }}>
              <li>Avg travel time: {optimization.after.avgTravelTimeMin.toFixed(2)} min (was {optimization.before.avgTravelTimeMin.toFixed(2)})</li>
              <li>Avg delay: {optimization.after.avgDelayMin.toFixed(2)} min (was {optimization.before.avgDelayMin.toFixed(2)})</li>
              <li>Avg speed: {optimization.after.avgSpeedKmh.toFixed(2)} km/h (was {optimization.before.avgSpeedKmh.toFixed(2)})</li>
              <li>NO2: {optimization.after.no2.toFixed(2)} ppb (was {optimization.before.no2.toFixed(2)})</li>
            </ul>
          </>
        )}
      </div>
      <div style={{ marginTop:'auto', display:'flex', justifyContent:'flex-end', gap:12 }}>
        <button onClick={onBackToAnalysis} style={{ background:'#2563eb', border:'none', color:'#fff', padding:'10px 16px', fontSize:12, borderRadius:6, cursor:'pointer', fontWeight:600 }}>Back to Impact View</button>
        <button disabled style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', color:'#64748b', padding:'10px 16px', fontSize:12, borderRadius:6 }}>Export (soon)</button>
      </div>
    </div>
  )
}
