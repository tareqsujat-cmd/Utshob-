import { Select } from './ui/Field.jsx';

// Two linked dropdowns: choosing a division limits the district list to that division.
// The lists come from GET /api/meta (meta.divisions = { Dhaka: ['Dhaka', 'Gazipur', ...], ... }).
export function DivisionDistrictSelect({ meta, division, district, onChange, errors = {}, required = true }) {
  const divisions = meta ? Object.keys(meta.divisions) : [];
  const districts = meta && division ? meta.divisions[division] || [] : [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Select
        label="Division"
        required={required}
        value={division || ''}
        placeholder="Choose division"
        options={divisions.map((d) => ({ value: d, label: d }))}
        onChange={(e) => onChange({ division: e.target.value, district: '' })}
        error={errors.division}
      />
      <Select
        label="District"
        required={required}
        value={district || ''}
        placeholder={division ? 'Choose district' : 'Choose a division first'}
        disabled={!division}
        options={districts.map((d) => ({ value: d, label: d }))}
        onChange={(e) => onChange({ division, district: e.target.value })}
        error={errors.district}
      />
    </div>
  );
}
