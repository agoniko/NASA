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
export function runDualPhaseSimulation({ onPhaseChange, onProgress, onDone, baselineDuration=1500, closureDuration=1600, pause=300 }) {
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
      onPhaseChange(null);
      onProgress(0);
      onDone();
    });
  });
}
