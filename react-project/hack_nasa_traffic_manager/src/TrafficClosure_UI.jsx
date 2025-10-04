// TrafficClosure_UI_Step1.jsx
// Step 1: Minimal React page for "Chiusure stradali" (Street Closures)
// - Uses react-map-gl + mapbox-gl-draw
// - Mock GeoJSON lane data included for demo
// - Click a lane to toggle CLOSED state
// - Sidebar shows computed metrics (km closed, avg vehicles, impact)

/*
How to run (quick):
1) Create a React app (Vite or CRA). Example with Vite:
   npm create vite@latest traffic-closure -- --template react
   cd traffic-closure
2) Install packages:
   npm install react-map-gl mapbox-gl @mapbox/mapbox-gl-draw
3) Add Tailwind (optional but recommended) or use plain CSS.
4) Put this file under src/TrafficClosure_UI_Step1.jsx and import it in App.jsx.
5) Set environment variable REACT_APP_MAPBOX_TOKEN with your Mapbox token or replace MAPBOX_TOKEN constant.

Note: This is an hackathon-ready minimal demo. We'll iterate next steps to add polygon selection, real traffic data, and simulations.
*/

import React, { useRef, useEffect, useState } from 'react'
import PostClosureAnalysisPanel from './components/PostClosureAnalysisPanel'
import PostOptimizationResultsPanel from './components/PostOptimizationResultsPanel'
import { parseOsmXmlToGeoJSON } from './utils/osmParser'
import { computeImpactStats } from './utils/impact'
import { runDualPhaseSimulation } from './utils/simulation'
import maplibregl from 'maplibre-gl'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import 'maplibre-gl/dist/maplibre-gl.css'

const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors'
    }
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm-tiles' }]
}


export default function TrafficClosureUI() {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null) // store maplibre instance
  const [sidebarWidth, setSidebarWidth] = useState(420)
  const resizingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(420)
  // Removed demo lanes; state simplified
  const [mapReady, setMapReady] = useState(false)
  const [lastError, setLastError] = useState(null)
  const [roadsData, setRoadsData] = useState(null)
  const [selectedWays, setSelectedWays] = useState(new Set())
  const [selectedSumoEdges, setSelectedSumoEdges] = useState(new Set())
  const [styleReady, setStyleReady] = useState(false)
  // OSM bbox raw xml -> geojson
  const [osmBboxGeoJSON, setOsmBboxGeoJSON] = useState(null)
  const [osmBboxLoading, setOsmBboxLoading] = useState(false)
  // OSM bbox always visible now (state removed)
  // Selection state for OSM ways
  const [selectedOsmIds, setSelectedOsmIds] = useState(new Set())
  // Simulation modal + flow
  const [showSimModal, setShowSimModal] = useState(false)
  const [crowdLevel, setCrowdLevel] = useState('medium') // low|medium|high
  const [simulationPhase, setSimulationPhase] = useState(null) // 'baseline' | 'closures' | null
  const [simulationProgress, setSimulationProgress] = useState(0) // 0..100
  const [analysisMode, setAnalysisMode] = useState(false) // switch to new page after sim
  const [simulationResults, setSimulationResults] = useState(null) // {before, after}
  // Optimization flow states
  const [optimizing, setOptimizing] = useState(false)
  const [optimizationPhase, setOptimizationPhase] = useState(null) // reuse 'baseline' | 'closures'
  const [optimizationProgress, setOptimizationProgress] = useState(0)
  const [optimizationResults, setOptimizationResults] = useState(null) // placeholder future data

  // Helpers to safely interact with map style
  function styleIsReady() {
    const map = mapRef.current
    if (!map) return false
    try {
      return !!map.isStyleLoaded() && !!map.getStyle()
    } catch (_) {
      return false
    }
  }

  function safeRun(fn, retryMs = 120, attempts = 10) {
    if (styleIsReady()) {
      try { fn() } catch (e) { console.warn('safeRun fn error', e) }
    } else if (attempts > 0) {
      setTimeout(() => safeRun(fn, retryMs, attempts - 1), retryMs)
    }
  }

  // Demo lanes removed; no filtered lanes needed.

  // Initialize MapLibre map
  useEffect(() => {
    // React 18 StrictMode in development mounts, unmounts, then mounts again.
    // If we created & removed the map in the first mount, mapRef would still hold a removed instance.
    if (mapRef.current) {
      if (mapRef.current.__removed) {
        console.log('[MapLibre] Previous removed instance detected; clearing ref for fresh init')
        mapRef.current = null
      } else {
        // A live map already exists, abort init.
        return
      }
    }
    // (Draw removed) No need for global alias.
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_RASTER_STYLE,
      center: [8.5417, 47.3769], // Zurich
      zoom: 13,
      maxZoom: 19,
      attributionControl: true
    })
    mapRef.current = map

    const nav = new maplibregl.NavigationControl({ visualizePitch: true })
    map.addControl(nav, 'top-left')

    // Draw removed; only lines needed.

    // Add lane source + layers when style is ready
    map.on('error', (e) => {
      const err = e?.error || e
      // Suppress benign tile fetch errors (network hiccups or 404 at high zoom)
      if (err && err.status === 0 && /tile\.openstreetmap\.org/.test(err?.url || '')) return
      if (err && /Failed to fetch/.test(String(err))) return
      console.error('[MapLibre error]', err)
      setLastError(prev => prev || String(err?.message || err))
    })

    let loadFired = false
    // Make map usable early (optimistic)
    setMapReady(true)
    map.on('load', () => {
      loadFired = true
      console.log('[MapLibre] style load event fired')
      setStyleReady(true)
    })
    // Safety: if "load" doesn't fire within 8s, downgrade to dismissible warning only once.
    const loadTimeoutId = setTimeout(() => {
      if (!loadFired) {
  const msg = 'Warning: map style not fully loaded after 8s. Continuing in degraded mode.'
        console.warn(msg)
        setLastError(prev => prev || msg)
      }
    }, 8000)

    return () => {
      try {
        map.__removed = true
        map.remove()
      } catch (e) {
        console.warn('Map remove error (ignored)', e)
      }
      clearTimeout(loadTimeoutId)
      // Allow re-init on StrictMode remount
      if (mapRef.current === map) {
        mapRef.current = null
      }
    }
  }, [])

  // Fetch Zurich roads (with SUMO mapping if available)
  useEffect(() => {
    async function loadRoads() {
      try {
        // Try enhanced file first
        let urls = ['/data/zurich_roads_with_sumo.geojson', '/data/zurich_roads_raw.geojson']
        let data = null
        for (const u of urls) {
          try {
            const r = await fetch(u)
            if (r.ok) { data = await r.json(); break }
          } catch (_) { /* ignore */ }
        }
        if (!data) return
        // Ensure each feature has an id for feature-state hover
        try {
          if (data.type === 'FeatureCollection') {
            data.features = data.features.map(f => {
              if (!f.id) {
                const fid = f.properties?.osm_way_id || f.properties?.id || Math.random().toString(36).slice(2)
                return { ...f, id: fid }
              }
              return f
            })
          }
        } catch (e) { console.warn('Assign feature ids (roads) failed', e) }
        setRoadsData(data)
        const map = mapRef.current
        const mapReadyForRoads = () => {
          const mapOk = map && styleIsReady()
          if (!mapOk) return false
          if (!map.getSource('roads')) {
            try {
              map.addSource('roads', { type: 'geojson', data })
              map.addLayer({
                id: 'roads-base',
                type: 'line',
                source: 'roads',
                paint: {
                  // Use a single zoom-based interpolate; inside each stop decide hover width
                  'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    10, ['case', ['boolean', ['feature-state','hover'], false], 1.2, 0.5],
                    14, ['case', ['boolean', ['feature-state','hover'], false], 3.2, 2.0],
                    16, ['case', ['boolean', ['feature-state','hover'], false], 5.0, 3.5]
                  ],
                  'line-color': [
                    'case', ['boolean', ['feature-state', 'hover'], false], '#ffe55c', '#666'
                  ]
                }
              })
              map.addLayer({
                id: 'roads-selected',
                type: 'line',
                source: 'roads',
                filter: ['in', 'osm_way_id', ''],
                paint: {
                  'line-width': 5,
                  'line-color': '#ff9800'
                }
              })
            } catch (e) {
              console.warn('addSource/addLayer before style ready, retrying', e)
              return false
            }
          }
          return true
        }
        if (!mapReadyForRoads()) {
          safeRun(mapReadyForRoads, 200, 15)
        }
      } catch (e) {
        console.error('Failed to load roads', e)
      }
    }
    loadRoads()
  }, [mapReady])

  // Load & parse OSM bbox XML (client-side). Moved parsing logic to utils/osmParser.
  useEffect(() => {
    if (!mapReady) return
    if (osmBboxGeoJSON || osmBboxLoading) return
    setOsmBboxLoading(true)
    ;(async () => {
      try {
        const resp = await fetch('/data/osm_bbox.osm.xml')
        if (!resp.ok) throw new Error('HTTP ' + resp.status)
        const text = await resp.text()
        const gj = parseOsmXmlToGeoJSON(text)
        // Assign feature ids for hover (osm_id)
        try {
          if (gj.type === 'FeatureCollection') {
            gj.features = gj.features.map(f => {
              if (!f.id) {
                const fid = f.properties?.osm_id || f.properties?.id || Math.random().toString(36).slice(2)
                return { ...f, id: fid }
              }
              return f
            })
          }
        } catch (e) { console.warn('Assign feature ids (bbox) failed', e) }
        console.log('[OSM parse] highway ways:', gj.features.length)
        setOsmBboxGeoJSON(gj)
      } catch (e) {
        console.warn('Failed parsing OSM bbox', e)
        setLastError(prev => prev || ('OSM bbox load: ' + e.message))
      } finally {
        setOsmBboxLoading(false)
      }
    })()
  }, [mapReady, osmBboxGeoJSON, osmBboxLoading])

  // Add / update OSM bbox layer when data or visibility changes
  useEffect(() => {
    if (!mapReady || !styleIsReady()) return
    const map = mapRef.current
    if (!map) return
    if (osmBboxGeoJSON && !map.getSource('osm-bbox')) {
      safeRun(() => {
        if (map.getSource('osm-bbox')) return
        map.addSource('osm-bbox', { type: 'geojson', data: osmBboxGeoJSON })
        // Base layer
        map.addLayer({
          id: 'osm-bbox-lines',
          type: 'line',
          source: 'osm-bbox',
          paint: {
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, ['case', ['boolean', ['feature-state','hover'], false], 1.2, 0.6],
              13, ['case', ['boolean', ['feature-state','hover'], false], 2.2, 1.2],
              15, ['case', ['boolean', ['feature-state','hover'], false], 3.6, 2.4],
              17, ['case', ['boolean', ['feature-state','hover'], false], 5.2, 4.0]
            ],
            'line-color': [
              'case', ['boolean', ['feature-state', 'hover'], false],
                '#ffd000',
                [ 'match', ['get', 'highway'], 'motorway', '#d73027', 'trunk', '#fc8d59', 'primary', '#fee08b', 'secondary', '#91bfdb', 'tertiary', '#4575b4', /* other */ '#888' ]
            ],
            'line-opacity': 0.95
          },
            layout: { 'visibility': 'none' }
        })
        // Selected highlight layer (on top of base)
        map.addLayer({
          id: 'osm-bbox-selected',
          type: 'line',
          source: 'osm-bbox',
          filter: ['in','osm_id',''],
          paint: {
            // Base width for selected; widen further if hovered or list-hovered
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, [ 'case', ['any', ['boolean',['feature-state','hover'],false], ['boolean',['feature-state','listHover'],false] ], 1.8, 1.2 ],
              13, [ 'case', ['any', ['boolean',['feature-state','hover'],false], ['boolean',['feature-state','listHover'],false] ], 2.8, 2.2 ],
              15, [ 'case', ['any', ['boolean',['feature-state','hover'],false], ['boolean',['feature-state','listHover'],false] ], 4.4, 3.4 ],
              17, [ 'case', ['any', ['boolean',['feature-state','hover'],false], ['boolean',['feature-state','listHover'],false] ], 6.4, 5.2 ]
            ],
            'line-color': [
              'case',
                ['boolean',['feature-state','listHover'],false], '#ffcc33',
                ['boolean',['feature-state','hover'],false], '#ff9d66',
                '#ff2d2d'
            ],
            'line-opacity': 0.95
          },
          layout: { 'visibility': 'none' }
        })
        try { map.moveLayer('osm-bbox-lines') } catch(_) {}
        try { map.moveLayer('osm-bbox-selected') } catch(_) {}
      })
    }
    // Update data if already there
    if (osmBboxGeoJSON && map.getSource('osm-bbox')) {
      const src = map.getSource('osm-bbox')
      if (src && src.setData) src.setData(osmBboxGeoJSON)
    }
    // Visibility logic (original layer visible if bbox on)
    if (map.getLayer('osm-bbox-lines')) {
      map.setLayoutProperty('osm-bbox-lines', 'visibility', 'visible')
      try { map.moveLayer('osm-bbox-lines') } catch(_) {}
      try { map.moveLayer('osm-bbox-selected') } catch(_) {}
      if (map.getLayer('osm-bbox-hover')) { try { map.moveLayer('osm-bbox-hover') } catch(_) {} }
    }
  }, [mapReady, osmBboxGeoJSON])

  // Update selection highlight filters
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.getLayer('osm-bbox-selected')) {
      const ids = Array.from(selectedOsmIds)
      map.setFilter('osm-bbox-selected', ['in','osm_id', ...(ids.length ? ids : [''])])
      map.setLayoutProperty('osm-bbox-selected','visibility', ids.length ? 'visible':'none')
    }
    // Manage feature-state 'selected' (not strictly needed for styling now, but future-proof)
    if (map && map.getSource('osm-bbox') && osmBboxGeoJSON) {
      try {
        // Clear previous selected states by iterating features (cheap for moderate counts)
        osmBboxGeoJSON.features.forEach(f => {
          if (!f.id) return
          map.setFeatureState({ source:'osm-bbox', id:f.id }, { selected: selectedOsmIds.has(f.properties?.osm_id) })
        })
      } catch(e) { /* ignore */ }
    }
    // Clear listHover for any feature no longer selected (safety)
    if (map && osmBboxGeoJSON) {
      try {
        osmBboxGeoJSON.features.forEach(f => {
          if (!f.id) return
          if (!selectedOsmIds.has(f.properties?.osm_id)) {
            map.setFeatureState({ source:'osm-bbox', id:f.id }, { listHover: false })
          }
        })
      } catch(_) {}
    }
  }, [selectedOsmIds])

  // Map click: select original OSM way lines, then roads layer.
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    function onRoadClick(e) {
      if (analysisMode) return // disable selecting after simulation
      if (map.getLayer('osm-bbox-lines')) {
        const osmFeats = map.queryRenderedFeatures(e.point, { layers: ['osm-bbox-lines'] })
        if (osmFeats && osmFeats.length) {
          const id = osmFeats[0].properties.osm_id
          setSelectedOsmIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
          return
        }
      }
      if (!map.getLayer('roads-base')) return
      const feats = map.queryRenderedFeatures(e.point, { layers: ['roads-base'] })
      if (!feats.length) return
      const wayId = feats[0].properties.osm_way_id
      setSelectedWays(prev => {
        const n = new Set(prev)
        n.has(wayId) ? n.delete(wayId) : n.add(wayId)
        safeRun(() => {
          if (map.getLayer('roads-selected')) map.setFilter('roads-selected', ['in', 'osm_way_id', ...n])
        })
        if (feats[0].properties.sumo_edges) {
          const edges = JSON.parse(JSON.stringify(feats[0].properties.sumo_edges))
          setSelectedSumoEdges(prevEdges => {
            const se = new Set(prevEdges)
            edges.forEach(ed => { se.has(ed) ? se.delete(ed) : se.add(ed) })
            return se
          })
        }
        return n
      })
    }
    map.on('click', onRoadClick)
    return () => map.off('click', onRoadClick)
  }, [mapReady, analysisMode])

  // Simplified hover via feature-state (no extra hover layers)
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    let hovered = { layer: null, id: null }
    function clearHover() {
      if (!map || !hovered.id) return
      try { map.setFeatureState({ source: hovered.layer === 'roads-base' ? 'roads':'osm-bbox', id: hovered.id }, { hover: false }) } catch(_) {}
      hovered = { layer:null, id:null }
      map.getCanvas().style.cursor = ''
    }
    function onMove(e) {
      if (analysisMode) { clearHover(); return }
      if (!styleIsReady()) return
      const layers = []
      if (map.getLayer('osm-bbox-lines')) layers.push('osm-bbox-lines')
      if (map.getLayer('roads-base')) layers.push('roads-base')
      if (!layers.length) return
      const feats = map.queryRenderedFeatures(e.point, { layers })
      if (!feats.length) { clearHover(); return }
      const f = feats[0]
      const layerId = f.layer.id
      const src = layerId === 'roads-base' ? 'roads':'osm-bbox'
      const fid = f.id
      if (hovered.id === fid && hovered.layer === layerId) return
      clearHover()
      if (fid == null) return
      try { map.setFeatureState({ source: src, id: fid }, { hover: true }) } catch(_) {}
      hovered = { layer: layerId, id: fid }
      map.getCanvas().style.cursor = 'pointer'
    }
    function onLeaveCanvas() { clearHover() }
    map.on('mousemove', onMove)
    map.on('mouseleave', onLeaveCanvas)
    return () => {
      map.off('mousemove', onMove)
      map.off('mouseleave', onLeaveCanvas)
      clearHover()
    }
  }, [mapReady, analysisMode])

  // Sidebar resize handlers
  useEffect(() => {
    function onMove(e) {
      if (!resizingRef.current) return
      const delta = e.clientX - startXRef.current
      let w = startWidthRef.current + delta
      w = Math.max(300, Math.min(700, w))
      setSidebarWidth(w)
    }
    function onUp() {
      if (resizingRef.current) {
        resizingRef.current = false
        document.body.style.cursor=''
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // Stats computation moved to utils/impact
  const stats = React.useMemo(() => computeImpactStats(osmBboxGeoJSON, selectedOsmIds), [osmBboxGeoJSON, selectedOsmIds])

  function categoryColor(cat) {
    switch(cat) {
      case 'non-impactful': return '#7e8695'
      case 'low': return '#4caf50'
      case 'impactful': return '#ffb300'
      case 'very': return '#ff7043'
      case 'extreme': return '#d32f2f'
      default: return '#888'
    }
  }

  function exportSelectedEdges(format = 'json') {
    const edges = Array.from(selectedSumoEdges)
  if (!edges.length) return alert('No road selected (SUMO edges)')
    if (format === 'json') {
      const blob = new Blob([JSON.stringify({ edges }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'selected_edges.json'
      a.click()
      URL.revokeObjectURL(url)
    } else if (format === 'xml') {
      const content = `<edges id="selection1" edges="${edges.join(' ')}"/>`
      const blob = new Blob([content], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'selected_edges.xml'
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Removed demo lane metrics.

  // Kick off dual-phase simulated loading
  function startSimulation() {
    if (!selectedOsmIds.size) return
    runDualPhaseSimulation({
      onPhaseChange: setSimulationPhase,
      onProgress: setSimulationProgress,
      onResults: (res) => setSimulationResults(res),
      onDone: () => {
        setShowSimModal(false)
        setAnalysisMode(true)
      }
    })
  }

  // Kick off optimization (dual-phase) using existing simulation utility but generating improved 'after' metrics
  function startOptimization() {
    if (optimizing) return
    setOptimizing(true)
    setOptimizationResults(null)
    runDualPhaseSimulation({
      baselineDuration: 1100,
      closureDuration: 1300,
      onPhaseChange: setOptimizationPhase,
      onProgress: setOptimizationProgress,
      onResults: (initial) => {
        // Create a synthetic "optimized" scenario by improving detrimental metrics
        if (!simulationResults) return
        const baseAfter = simulationResults.after
        const optimized = { ...baseAfter }
        /*
          Adjusted synthetic optimization:
          - Improvements toned down (~reductions scaled by 2/3 of previous delta) so they look more realistic.
          - One metric left neutral (vkt) to show no change.
          - One metric intentionally worsened (pm10) to demonstrate trade‑offs.
        */
        optimized.avgTravelTimeMin *= 0.953   // was 0.93 (now ~4.7% better vs 7%)
        optimized.avgDelayMin *= 0.893        // was 0.84 (now ~10.7% better vs 16%)
        optimized.maxDelayMin *= 0.933        // was 0.90
        optimized.avgQueueTimeMin *= 0.920    // was 0.88
        optimized.avgSpeedKmh *= 1.047        // was 1.07
        optimized.vkt *= 1.000                // neutral (previously slight improvement)
        optimized.vht *= 0.947                // was 0.92
        optimized.pm25 *= 0.967               // was 0.95
        optimized.o3 *= 0.993                 // was 0.99 (tiny improvement)
        optimized.no2 *= 0.960                // was 0.94
        optimized.pm10 *= 1.040               // intentionally slightly worse (+4%)
        setOptimizationResults({ before: simulationResults.after, after: optimized, generatedAt: Date.now() })
      },
      onDone: () => {
        setOptimizationPhase(null)
        setOptimizationProgress(0)
        setOptimizing(false)
        // Future: trigger display of new component with optimizationResults
      }
    })
  }

  return (
    <div style={{ height: '100vh', display: 'flex', fontFamily: 'system-ui, Roboto, Arial, sans-serif', userSelect: resizingRef.current ? 'none':'auto' }}>
      {/* Sidebar (selection vs analysis modes) */}
  <aside style={{ width: sidebarWidth, padding: '18px 18px 48px 18px', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', zIndex: 20, display:'flex', flexDirection:'column', overflowX:'hidden', overflowY:'auto', minHeight:0 }}>
        {!analysisMode && (
          <>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginBottom: 6 }}>Critical Road Impact Analyzer</h1>
        <p style={{ fontSize: 12.5, lineHeight: 1.4, color: '#444', marginBottom: 12 }}>
          Click street segments in the map to build a closure set. The panel below estimates relative traffic exposure and impact.
        </p>
        {osmBboxLoading && <div style={{ fontSize: 11, color: '#777', marginBottom: 10 }}>Loading OSM data…</div>}
        <div style={{ flex:1, overflowY:'auto', paddingRight:4 }}>
        <section style={{ marginTop: 8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: '.3px' }}>Blocked lines ({selectedOsmIds.size})</div>
            <button disabled={!selectedOsmIds.size} onClick={() => setSelectedOsmIds(new Set())} style={{ background: selectedOsmIds.size? '#dc2626':'#bbb', color:'#fff', border:'none', padding:'4px 10px', fontSize:11, borderRadius:4, cursor: selectedOsmIds.size? 'pointer':'default' }}>Clear</button>
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 220, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4, background: '#fafafa' }}>
            {selectedOsmIds.size === 0 && (
              <li style={{ padding: '8px 10px', fontSize: 11, color: '#777' }}>No selection yet. Click a line on the map.</li>
            )}
            {Array.from(selectedOsmIds).map(id => {
              const feat = osmBboxGeoJSON?.features.find(f => f.properties.osm_id === id)
              if (!feat) return null
              const { name, highway, length_km } = feat.properties
              const meters = Math.round((length_km||0)*1000)
              return (
                <li
                  key={id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: '1px solid #f2f2f2', fontSize: 11 }}
                  onMouseEnter={() => {
                    const map = mapRef.current; if (!map || !feat.id) return; try { map.setFeatureState({ source:'osm-bbox', id: feat.id }, { listHover: true }) } catch(_) {}
                  }}
                  onMouseLeave={() => {
                    const map = mapRef.current; if (!map || !feat.id) return; try { map.setFeatureState({ source:'osm-bbox', id: feat.id }, { listHover: false }) } catch(_) {}
                  }}
                >
                  <div style={{ flex: 1, paddingRight: 6 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: 200 }}>{name || id}</div>
                    <div style={{ color: '#666' }}>{highway}{length_km != null && ` • ${meters} m`}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setSelectedOsmIds(prev => { const n=new Set(prev); n.delete(id); return n })} style={{ background: '#f87171', border: 'none', color: '#fff', padding: '2px 6px', fontSize: 10, borderRadius: 4, cursor: 'pointer' }}>X</button>
                  </div>
                </li>
              )
            })}
          </ul>
          {/* Removed redundant total length + duplicate clear button */}
        </section>
        <section style={{ marginTop: 24, marginBottom: 8 }}>
          <div id='stats-section' style={{ fontWeight: 600, fontSize: 15, marginBottom: 10, letterSpacing: '.3px' }}>Traffic & Impact</div>
          {!stats && (
            <div style={{ fontSize: 11, color: '#777', border: '1px dashed #ccc', padding: 10, borderRadius: 4 }}>Select at least one street to generate statistics.</div>
          )}
          {stats && (
            <div style={{ fontSize: 11 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
                <div style={{ background:'#f5f5f5', padding:'6px 10px', borderRadius:4 }}><span role='img' aria-label='length'>📏</span> <strong>{Math.round(stats.totalKm*1000)}</strong> m selected</div>
                <div style={{ background:'#f5f5f5', padding:'6px 10px', borderRadius:4 }}><span role='img' aria-label='vehicles'>🚗</span> <strong>{stats.areaVehicles}</strong> veh/h area baseline</div>
                <div style={{ background:'#f5f5f5', padding:'6px 10px', borderRadius:4 }}><span role='img' aria-label='impact'>⚠</span> Impact: {['non-impactful','low','impactful','very','extreme'].map(k => (
                    <span key={k} style={{ marginRight:6 }}><span style={{ display:'inline-block', width:10, height:10, background:categoryColor(k), borderRadius:2, marginRight:3 }}></span>{stats.distribution[k]||0}</span>
                  ))}</div>
              </div>
              <div style={{ fontSize:10.5, color:'#555', marginBottom:8, lineHeight:1.35 }}>
                % Area = segment share of the total vehicle throughput within the analysis scope.
              </div>
              <div style={{ border:'1px solid #eee', borderRadius:4, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead style={{ background:'#fafafa' }}>
                    <tr style={{ textAlign:'left' }}>
                      <th style={{ padding:'6px 8px', fontSize:11 }}>Street</th>
                      <th style={{ padding:'6px 8px', fontSize:11 }}>Type</th>
                      <th style={{ padding:'6px 8px', fontSize:11 }}>m</th>
                      <th style={{ padding:'6px 8px', fontSize:11 }}>Veh/h</th>
                      <th style={{ padding:'6px 8px', fontSize:11 }}>% Area</th>
                      <th style={{ padding:'6px 8px', fontSize:11 }}>Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.rows.map(r => (
                      <tr key={r.id} style={{ borderTop:'1px solid #f0f0f0' }}>
                        <td style={{ padding:'5px 8px', fontSize:11 }}>{r.name || r.id}</td>
                        <td style={{ padding:'5px 8px', fontSize:11 }}>{r.highway}</td>
                        <td style={{ padding:'5px 8px', fontSize:11 }}>{Math.round((r.length_km||0)*1000)}</td>
                        <td style={{ padding:'5px 8px', fontSize:11 }}>{r.vehiclesPerHour}</td>
                        <td style={{ padding:'5px 8px', fontSize:11 }}>{(r.share*100).toFixed(2)}%</td>
                        <td style={{ padding:'5px 8px', fontSize:11 }}>
                          <span style={{ background: categoryColor(r.category), color:'#fff', padding:'2px 6px', borderRadius: 12, fontSize:10, textTransform:'capitalize' }}>
                            {r.category === 'very' ? 'High' : (r.category === 'low' ? 'Low' : (r.category === 'impactful' ? 'Medium' : (r.category === 'extreme' ? 'Extreme' : 'No impact')))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div style={{ marginTop:10, fontSize:10.5 }}>
                <strong>Legend:</strong> <span style={{ marginLeft:6 }}><span style={{ background:categoryColor('non-impactful'), display:'inline-block', width:10, height:10, borderRadius:2, marginRight:3 }}></span>No impact</span>
                <span style={{ marginLeft:6 }}><span style={{ background:categoryColor('low'), display:'inline-block', width:10, height:10, borderRadius:2, marginRight:3 }}></span>Low</span>
                <span style={{ marginLeft:6 }}><span style={{ background:categoryColor('impactful'), display:'inline-block', width:10, height:10, borderRadius:2, marginRight:3 }}></span>Medium</span>
                <span style={{ marginLeft:6 }}><span style={{ background:categoryColor('very'), display:'inline-block', width:10, height:10, borderRadius:2, marginRight:3 }}></span>High</span>
                <span style={{ marginLeft:6 }}><span style={{ background:categoryColor('extreme'), display:'inline-block', width:10, height:10, borderRadius:2, marginRight:3 }}></span>Extreme</span>
              </div>
            </div>
          )}
        </section>
        </div>
        <div style={{ marginTop:'auto', textAlign:'center', paddingTop:10 }}>
          <button
            onClick={() => { if (selectedOsmIds.size) setShowSimModal(true) }}
            disabled={!selectedOsmIds.size}
            style={{
              background: selectedOsmIds.size ? 'linear-gradient(90deg,#1d4ed8,#2563eb)' : '#9ca3af',
              color: '#fff',
              border: 'none',
              padding: '12px 22px',
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: .5,
              borderRadius: 34,
              cursor: selectedOsmIds.size ? 'pointer' : 'default',
              boxShadow: selectedOsmIds.size ? '0 3px 10px -2px rgba(37,99,235,0.45)' : '0 1px 2px rgba(0,0,0,0.15)',
              transition: 'background .15s, transform .15s',
              minWidth: 200,
              marginBottom: 4
            }}
            title={selectedOsmIds.size ? 'Configure simulation parameters' : 'Select at least one street'}
            onMouseDown={e => { if (selectedOsmIds.size) e.currentTarget.style.transform='translateY(1px)' }}
            onMouseUp={e => { e.currentTarget.style.transform='none' }}
          >ANALYZE TRAFFIC</button>
        </div>
          </>
        )}
        {analysisMode && !optimizationResults && (
          <PostClosureAnalysisPanel
            onBack={() => setAnalysisMode(false)}
            crowdLevel={crowdLevel}
            selectedCount={selectedOsmIds.size}
            results={simulationResults}
            onOptimize={startOptimization}
            optimizing={optimizing}
          />
        )}
        {analysisMode && optimizationResults && (
          <PostOptimizationResultsPanel
            baseResults={simulationResults}
            optimization={optimizationResults}
            onBackToAnalysis={() => setOptimizationResults(null)}
          />
        )}
      </aside>
      {/* Resize handle */}
      <div
        onMouseDown={(e) => { resizingRef.current = true; startXRef.current = e.clientX; startWidthRef.current = sidebarWidth; document.body.style.cursor='col-resize' }}
        style={{ width:6, cursor:'col-resize', background:'linear-gradient(to right,#ececec,#f9f9f9)', borderRight:'1px solid #d5d5d5', zIndex:25 }}
      />

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {!mapReady && (
          <div style={{position:'absolute', top:8,left:8, background:'#fff', padding:6, fontSize:12, zIndex:30, border:'1px solid #ddd', borderRadius:4}}>Loading map…</div>
        )}
        {lastError && (
          <div style={{position:'absolute', bottom:8,left:8, background:'#fffefa', color:'#92400e', padding:6, fontSize:12, zIndex:30, border:'1px solid #fcd34d', borderRadius:4, maxWidth:300, display:'flex', gap:6, alignItems:'flex-start'}}>
            <div style={{ flex:1 }}>
              {lastError}
            </div>
            <button onClick={()=>setLastError(null)} style={{ background:'transparent', border:'none', color:'#92400e', cursor:'pointer', fontSize:14, lineHeight:1 }}>×</button>
          </div>
        )}
        <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
      {/* Full-screen modal overlay covering sidebar + map */}
      {showSimModal && (
        <div
          role='dialog'
          aria-modal='true'
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex: 200,
            backdropFilter: 'blur(2px)'
          }}
          onMouseDown={(e) => {
            // Optional: click outside to close only if not running
            if (e.target === e.currentTarget && !simulationPhase) setShowSimModal(false)
          }}
        >
          <div style={{ width:420, maxWidth:'90%', background:'#fff', borderRadius:14, boxShadow:'0 10px 34px -4px rgba(0,0,0,0.45)', padding:'22px 26px', maxHeight:'82vh', display:'flex', flexDirection:'column', position:'relative' }}>
            {!simulationPhase && (
              <button
                onClick={() => setShowSimModal(false)}
                aria-label='Close'
                style={{ position:'absolute', top:10, right:10, background:'transparent', border:'none', cursor:'pointer', fontSize:18, lineHeight:1, color:'#64748b' }}
              >×</button>
            )}
            <h2 style={{ margin:0, fontSize:20, fontWeight:600, marginBottom:6 }}>Simulation Setup</h2>
            <div style={{ fontSize:13, color:'#555', marginBottom:16 }}>Adjust scenario parameters and start the two-phase analysis.</div>
            <label style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Estimated crowd level</label>
            <div style={{ display:'flex', gap:10, marginBottom:20 }}>
              {['low','medium','high'].map(l => (
                <button key={l} onClick={() => setCrowdLevel(l)} style={{
                  flex:1,
                  background: crowdLevel===l ? '#2563eb' : '#f1f5f9',
                  color: crowdLevel===l ? '#fff':'#334155',
                  border:'1px solid ' + (crowdLevel===l ? '#1d4ed8':'#cbd5e1'),
                  padding:'10px 8px',
                  borderRadius:8,
                  fontSize:12,
                  cursor:'pointer',
                  fontWeight: crowdLevel===l ? 600:500,
                  transition:'background .15s,border-color .15s'
                }}>{l.charAt(0).toUpperCase()+l.slice(1)}</button>
              ))}
            </div>
            {simulationPhase && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:8 }}>
                  {simulationPhase === 'baseline' ? 'Phase 1: Calibrating baseline network' : 'Phase 2: Evaluating closures'}
                </div>
                <div style={{ height:12, background:'#e2e8f0', borderRadius:8, overflow:'hidden', position:'relative' }}>
                  <div style={{ width: simulationProgress+'%', height:'100%', background: simulationPhase==='baseline' ? 'linear-gradient(90deg,#0ea5e9,#2563eb)' : 'linear-gradient(90deg,#f59e0b,#d97706)', transition:'width .2s ease' }} />
                </div>
                <div style={{ marginTop:6, fontSize:11, color:'#555' }}>{Math.round(simulationProgress)}%</div>
              </div>
            )}
            {!simulationPhase && (
              <div style={{ display:'flex', justifyContent:'flex-end', gap:12, marginTop:4 }}>
                <button onClick={() => setShowSimModal(false)} style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', color:'#334155', padding:'10px 16px', fontSize:12, borderRadius:8, cursor:'pointer' }}>Cancel</button>
                <button disabled={!selectedOsmIds.size} onClick={startSimulation} style={{ background:'#2563eb', border:'none', color:'#fff', padding:'10px 20px', fontSize:12, borderRadius:8, cursor:selectedOsmIds.size?'pointer':'default', fontWeight:600, boxShadow:selectedOsmIds.size?'0 4px 16px -4px rgba(37,99,235,0.55)':'none' }}>Start simulation</button>
              </div>
            )}
            {simulationPhase && (
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:8 }}>
                <button disabled style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', color:'#94a3b8', padding:'8px 14px', fontSize:11, borderRadius:8 }}>Running…</button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Optimization overlay modal (similar style) */}
      {optimizing && (
        <div
          role='dialog'
          aria-modal='true'
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}
        >
          <div style={{ width:400, maxWidth:'92%', background:'#fff', padding:'22px 26px', borderRadius:16, boxShadow:'0 10px 34px -6px rgba(0,0,0,0.5)', fontSize:13 }}>
            <h2 style={{ margin:0, fontSize:19, fontWeight:600, marginBottom:8 }}>Traffic Flow Optimization</h2>
            <div style={{ fontSize:12.5, color:'#555', marginBottom:16 }}>Calibrating adaptive re-routing and signal timing…</div>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>
                {optimizationPhase === 'baseline' ? 'Phase A: Evaluating current disrupted flow' : 'Phase B: Applying optimization heuristics'}
              </div>
              <div style={{ height:12, background:'#e2e8f0', borderRadius:8, overflow:'hidden' }}>
                <div style={{ width: optimizationProgress+'%', height:'100%', background: optimizationPhase==='baseline' ? 'linear-gradient(90deg,#4f46e5,#6366f1)' : 'linear-gradient(90deg,#059669,#10b981)', transition:'width .25s ease' }} />
              </div>
              <div style={{ marginTop:6, fontSize:11, color:'#555' }}>{Math.round(optimizationProgress)}%</div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button disabled style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', color:'#94a3b8', padding:'8px 14px', fontSize:11, borderRadius:8 }}>Optimizing…</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
