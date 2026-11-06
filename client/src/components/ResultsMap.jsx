import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

// Numbered round markers drawn with HTML (no image files). `color` is any CSS colour.
function numberIcon(label, color) {
  return L.divIcon({
    className: '',
    html: `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:9999px;background:${color};color:#fff;font:600 12px Inter,sans-serif;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)">${label}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Zoom the map so every point is visible.
function FitAll({ points }) {
  const map = useMap();
  // Re-fit only when the coordinates really change (not on every re-render).
  const key = points.map((p) => `${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    const coords = key.split('|').map((pair) => pair.split(',').map(Number));
    if (coords.length === 1) map.setView(coords[0], 14);
    if (coords.length > 1) map.fitBounds(coords, { padding: [30, 30] });
  }, [map, key]);
  return null;
}

// A read-only map with several numbered markers.
// points: [{ lat, lng, label, color, title }]
export function ResultsMap({ points, height = 360 }) {
  const usable = points.filter((p) => p.lat && p.lng);
  if (usable.length === 0) return null;
  return (
    <div className="relative z-0 overflow-hidden rounded-xl border border-line" style={{ height }}>
      <MapContainer center={[usable[0].lat, usable[0].lng]} zoom={12} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitAll points={usable} />
        {usable.map((p) => (
          <Marker key={`${p.label}-${p.lat}-${p.lng}`} position={[p.lat, p.lng]} icon={numberIcon(p.label, p.color)}>
            <Tooltip>{p.title}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
