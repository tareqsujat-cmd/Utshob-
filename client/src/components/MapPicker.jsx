import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Our own map pin (teal dot with a white ring), drawn with HTML instead of Leaflet's default image.
const pinIcon = L.divIcon({
  className: '',
  html: '<span style="display:block;width:22px;height:22px;border-radius:9999px;background:#0e5e5a;border:4px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const round = (n) => Math.round(n * 1e6) / 1e6; // 6 decimals ≈ 10 cm, plenty

// Calls onPick when the map is clicked.
function ClickToPlace({ onPick }) {
  useMapEvents({ click: (event) => onPick({ lat: round(event.latlng.lat), lng: round(event.latlng.lng) }) });
  return null;
}

// Moves the map when `center` changes (e.g. the user picks another division).
function FollowCenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], zoom);
  }, [map, center.lat, center.lng, zoom]);
  return null;
}

// A Leaflet + OpenStreetMap map with one pin.
//   value:    { lat, lng } or null      onChange: called with the new { lat, lng }
//   center:   where to look when there is no pin yet      readOnly: just show the pin
export function MapPicker({ value, onChange, center, readOnly = false, height = 280 }) {
  const hasPin = Boolean(value?.lat && value?.lng);
  const focus = hasPin ? value : center;

  return (
    <div className="relative z-0 overflow-hidden rounded-xl border border-line" style={{ height }}>
      <MapContainer center={[focus.lat, focus.lng]} zoom={hasPin ? 15 : 11} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FollowCenter center={focus} zoom={hasPin ? 15 : 11} />
        {!readOnly && <ClickToPlace onPick={onChange} />}
        {hasPin && (
          <Marker
            position={[value.lat, value.lng]}
            icon={pinIcon}
            draggable={!readOnly}
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = event.target.getLatLng();
                onChange({ lat: round(lat), lng: round(lng) });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
