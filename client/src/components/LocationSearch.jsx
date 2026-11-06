import { useState } from 'react';
import { api } from '../api/client.js';
import { Input } from './ui/Field.jsx';
import { Button } from './ui/Button.jsx';
import { Alert } from './ui/Layout.jsx';
import { Icon } from './ui/Icon.jsx';
import { DivisionDistrictSelect } from './DivisionDistrictSelect.jsx';
import { MapPicker } from './MapPicker.jsx';

// M2-B: find a place with Nominatim, then CONFIRM or CORRECT it:
//   1. type and press Search (Nominatim's policy: no search-as-you-type)
//   2. pick a result: the pin appears on the map
//   3. drag the pin to correct it, or fix division/district in the dropdowns
// If Nominatim is down or finds nothing, the manual fields below always work (fallback).
// value: { division, district, address, lat, lng, source: 'nominatim' | 'manual' }
export function LocationSearch({ meta, value, onChange }) {
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function search(e) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const { places: found } = await api.get(`/geo/search?q=${encodeURIComponent(query)}`);
      setPlaces(found);
    } catch (err) {
      setError(err.message);
      setPlaces(null);
    } finally {
      setBusy(false);
    }
  }

  function pick(place) {
    onChange({
      division: place.division || value.division,
      district: place.district || (place.division ? '' : value.district),
      address: place.displayName.split(',').slice(0, 3).join(','),
      lat: place.lat,
      lng: place.lng,
      source: 'nominatim',
    });
    setPlaces(null);
  }

  // Pin dragged: keep the new point and ask Nominatim what is there (best effort).
  async function movePin({ lat, lng }) {
    onChange({ ...value, lat, lng });
    try {
      const { place } = await api.get(`/geo/reverse?lat=${lat}&lng=${lng}`);
      if (place) onChange({ ...value, lat, lng, address: place.displayName.split(',').slice(0, 3).join(','), division: place.division || value.division, district: place.district || value.district });
    } catch {
      /* keep the pin; the address can be typed */
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="flex gap-2">
        <Input aria-label="Search for a place" className="flex-1" placeholder="e.g. Dhanmondi 27, Dhaka" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" variant="secondary" icon="search" loading={busy}>Search</Button>
      </form>
      {error && <Alert tone="warning" title="Map search unavailable">{error} The fields below still work.</Alert>}
      {places && places.length === 0 && <Alert tone="info">No place found. Try another spelling, or enter the address below.</Alert>}
      {places && places.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {places.map((p) => (
            <li key={`${p.lat},${p.lng}`}>
              <button type="button" onClick={() => pick(p)} className="flex w-full gap-2 px-3 py-2 text-left text-sm hover:bg-paper">
                <Icon name="mapPin" size={16} className="mt-0.5 shrink-0 text-primary" />
                <span>{p.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <MapPicker value={value.lat ? value : null} onChange={movePin} center={meta.divisionCenters[value.division] || meta.divisionCenters.Dhaka} height={240} />
      <p className="text-xs text-muted">
        {value.lat
          ? `Pin from ${value.source === 'nominatim' ? 'map search' : 'the map'}: drag it to correct, and check the division and district below.`
          : 'No pin: you can also click the map, or just fill in the fields below.'}
      </p>
      <DivisionDistrictSelect meta={meta} division={value.division} district={value.district} onChange={(changes) => onChange({ ...value, ...changes, source: value.source || 'manual' })} />
      <Input label="Address" value={value.address || ''} onChange={(e) => onChange({ ...value, address: e.target.value, source: value.source || 'manual' })} />
    </div>
  );
}
