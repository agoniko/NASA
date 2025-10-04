// Utility: Parse minimal OSM XML string into GeoJSON FeatureCollection of highway ways
// Returns { type:'FeatureCollection', features:[ { geometry, properties:{ osm_id, highway, name, length_km } } ] }
export function parseOsmXmlToGeoJSON(xmlText) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  const nodeEls = Array.from(xml.getElementsByTagName('node'));
  const nodes = new Map();
  nodeEls.forEach(n => {
    const id = n.getAttribute('id');
    const lat = parseFloat(n.getAttribute('lat'));
    const lon = parseFloat(n.getAttribute('lon'));
    if (!isNaN(lat) && !isNaN(lon)) nodes.set(id, [lon, lat]);
  });
  const ways = Array.from(xml.getElementsByTagName('way'));
  const features = [];
  ways.forEach(w => {
    const tags = Array.from(w.getElementsByTagName('tag')).reduce((acc, t) => {
      acc[t.getAttribute('k')] = t.getAttribute('v');
      return acc;
    }, {});
    if (!('highway' in tags)) return;
    const ndRefs = Array.from(w.getElementsByTagName('nd')).map(nd => nd.getAttribute('ref')).filter(r => nodes.has(r));
    if (ndRefs.length < 2) return;
    const coords = ndRefs.map(r => nodes.get(r));
    // length calculation (haversine)
    let lengthKm = 0;
    for (let i = 1; i < coords.length; i++) {
      const [lon1, lat1] = coords[i - 1];
      const [lon2, lat2] = coords[i];
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      lengthKm += R * c;
    }
    features.push({
      type: 'Feature',
      properties: {
        osm_id: w.getAttribute('id'),
        highway: tags.highway,
        name: tags.name || null,
        length_km: Number(lengthKm.toFixed(3))
      },
      geometry: { type: 'LineString', coordinates: coords }
    });
  });
  return { type: 'FeatureCollection', features };
}
