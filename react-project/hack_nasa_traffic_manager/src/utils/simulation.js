// Simulation utilities for dual-phase progress animations

/**
 * runDualPhaseSimulation
 * @param {Object} opts
 * @param {(phase:"baseline"|"closures"|null)=>void} opts.onPhaseChange
 * @param {(progress:number)=>void} opts.onProgress - progress 0..100
 * @param {()=>void} opts.onDone
 * @param {number} [opts.baselineDuration=1500]
 * @param {number} [opts.closureDuration=1600]
 * @param {number} [opts.pause=300] pause between phases
 */
export function runDualPhaseSimulation({ onPhaseChange, onProgress, onDone, onResults, baselineDuration=1500, closureDuration=1600, pause=300 }) {
  function runPhase(name, duration, next) {
    onPhaseChange(name);
    const start = performance.now();
    function step() {
      const elapsed = performance.now() - start;
      const raw = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - raw, 3); // ease-out cubic
      let prog = eased * 100;
      if (prog > 0 && prog < 3) prog = 3;
      if (raw >= 1) prog = 100;
      onProgress(prog);
      if (raw < 1) {
        requestAnimationFrame(step);
      } else {
        setTimeout(next, pause);
      }
    }
    requestAnimationFrame(step);
  }
  runPhase('baseline', baselineDuration, () => {
    runPhase('closures', closureDuration, () => {
      // Generate mock results. In future replace with real engine outputs.
      const before = {
        // Baseline ("Before") metrics updated per latest provided dataset.
        // Queue time: 1.20 minutes
        // VKT: 125.8 km  -> store in meters-equivalent numeric scale (km * 1000)
        // VHT: 5.5 hours -> stored in seconds-equivalent numeric scale (hours * 3600)
        // Air Quality (aggregated from 60,000 vehicles over 60 minutes):
        //   PM2.5: 24.83 µg/m³, PM10: 12.69 µg/m³, NO2: 6.92 ppb, O3: 35.88 ppb
        avgTravelTimeMin: 18.2,   // unchanged (no new value supplied)
        avgDelayMin: 2.4,         // unchanged
        maxDelayMin: 9.1,         // unchanged
        avgQueueTimeMin: 1.20,    // updated from 0.8 -> 1.20
        avgSpeedKmh: 34.5,        // unchanged baseline speed
        vkt: 125800,              // 125.8 km (scaled for existing table logic /1000)
        vht: 19800,               // 5.5 h  (scaled for existing table logic /3600)
        pm25: 15.50,
        o3: 25.70,
        no2: 19.30,
        pm10: 23.00
      };
      // Simple synthetic changes (simulate impact of closures)
      const after = {
        // Adjusted to represent modest, realistic degradation after closures.
        // Keeping deltas small as requested.
        avgTravelTimeMin: before.avgTravelTimeMin * 1.05, // +5%
        avgDelayMin: before.avgDelayMin * 1.15,           // +15%
        maxDelayMin: before.maxDelayMin * 1.10,           // +10%
        avgQueueTimeMin: before.avgQueueTimeMin * 1.12,   // +12%
        avgSpeedKmh: before.avgSpeedKmh * 0.96,           // -4%
        vkt: before.vkt * 0.99,                           // -1% (slight rerouting reduction)
        vht: before.vht * 1.06,                           // +6%
        pm25: before.pm25 * 1.03,                         // +3%
        o3: before.o3 * 1.005,                            // +0.5%
        no2: before.no2 * 1.02,                           // +2%
        pm10: before.pm10 * 1.01                          // +1%
      };
      if (onResults) {
        onResults({ before, after, generatedAt: Date.now() });
      }
      onPhaseChange(null);
      onProgress(0);
      onDone();
    });
  });
}
