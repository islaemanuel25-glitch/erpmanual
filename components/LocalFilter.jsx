"use client";

export default function LocalFilter({ locales, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">Local</label>

      <select
        className="border rounded px-2 py-1 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Todos los locales</option>

        {locales.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
