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
        avgTravelTimeMin: 18.2,
        avgDelayMin: 2.4,
        maxDelayMin: 9.1,
        avgQueueTimeMin: 0.8,
        avgSpeedKmh: 34.5,
        vkt: 128450, // vehicle-km traveled
        vht: 37200,  // vehicle-hours traveled (seconds? kept as number)
        pm25: 14.2,
        o3: 31.5,
        no2: 26.3,
        pm10: 22.0
      };
      // Simple synthetic changes (simulate impact of closures)
      const after = {
        avgTravelTimeMin: before.avgTravelTimeMin * 1.12,
        avgDelayMin: before.avgDelayMin * 1.55,
        maxDelayMin: before.maxDelayMin * 1.35,
        avgQueueTimeMin: before.avgQueueTimeMin * 1.9,
        avgSpeedKmh: before.avgSpeedKmh * 0.88,
        vkt: before.vkt * 0.97, // slight reduction maybe due to avoidance
        vht: before.vht * 1.18,
        pm25: before.pm25 * 1.07,
        o3: before.o3 * 1.01,
        no2: before.no2 * 1.09,
        pm10: before.pm10 * 1.06
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
