// Impact & traffic heuristic utilities

// Deterministic hash for stable pseudo-random numbers
export function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i) | 0;
  }
  return h >>> 0;
}

const baseByType = { motorway: 1800, trunk: 1500, primary: 1200, secondary: 800, tertiary: 500, residential: 250, service: 120 };
const forceExtremeNames = new Set(['münsterbrücke','rathausbrücke','rudolf-brun-brücke','mühlesteg']);

export function computeImpactStats(geojson, selectedIds) {
  if (!geojson || !selectedIds || !selectedIds.size) return null;
  const rows = [];
  let totalKm = 0;
  const nameSeedCache = new Map();
  const norm = (s) => (s || '').toLowerCase().trim();
  Array.from(selectedIds).forEach(id => {
    const feat = geojson.features.find(f => f.properties.osm_id === id);
    if (!feat) return;
    const { length_km, name, highway } = feat.properties;
    totalKm += (length_km || 0);
    let vehiclesPerHour;
    const n = norm(name);
    if (n) {
      if (!nameSeedCache.has(n)) {
        const h = hashId(n);
        const fluct = (h % 400) - 200;
        const base = baseByType[highway] || 300;
        vehiclesPerHour = Math.max(40, base + fluct * 0.5 | 0);
        nameSeedCache.set(n, vehiclesPerHour);
      } else {
        vehiclesPerHour = nameSeedCache.get(n);
      }
    } else {
      const h = hashId(id);
      const fluct = (h % 400) - 200;
      const base = baseByType[highway] || 300;
      vehiclesPerHour = Math.max(40, base + fluct * 0.6 | 0);
    }
    rows.push({ id, name, highway, length_km, vehiclesPerHour });
  });
  const sumVehicles = rows.reduce((a, r) => a + r.vehiclesPerHour, 0);
  const areaVehicles = sumVehicles * 1.35 + 500;
  rows.forEach(r => {
    r.share = r.vehiclesPerHour / areaVehicles;
    const len = r.length_km || 0;
    const impactScore = Math.pow(r.vehiclesPerHour, 0.9) * Math.pow(r.share, 0.65) * (1 + len * 1.8);
    let category;
    if (forceExtremeNames.has((r.name || '').toLowerCase())) {
      category = 'extreme';
    } else if (impactScore < 130) category = 'non-impactful';
    else if (impactScore < 300) category = 'low';
    else if (impactScore < 680) category = 'impactful';
    else if (impactScore < 1250) category = 'very';
    else category = 'extreme';

    if (r.highway === 'footway') category = 'non-impactful';
    if (r.highway === 'residential' && (category === 'non-impactful')) category = 'low';
    if (r.highway === 'tertiary' && (category === 'non-impactful' || category === 'low')) category = 'impactful';
    r.category = category;
    r.impactScore = impactScore;
  });
  const distribution = rows.reduce((acc, r) => { acc[r.category] = (acc[r.category] || 0) + 1; return acc; }, {});
  return { totalKm: Number(totalKm.toFixed(3)), areaVehicles: Math.round(areaVehicles), rows, distribution };
}
