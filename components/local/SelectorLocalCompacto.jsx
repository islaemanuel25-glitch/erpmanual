"use client";

import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

export default function SelectorLocalCompacto({
  locales,
  localSeleccionado,
  localNombre,
  onChange,
}) {
  if (!locales || locales.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-amber-400 font-medium truncate">
        {localNombre || "Sin local"}
      </span>
      <SunmiSelectAdv
        value={String(localSeleccionado || "")}
        onChange={onChange}
        className="!w-36 lg:!w-44"
      >
        {locales.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nombre}
          </option>
        ))}
      </SunmiSelectAdv>
    </div>
  );
}
