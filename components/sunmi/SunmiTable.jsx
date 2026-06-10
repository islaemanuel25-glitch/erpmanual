"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiTable({
  headers = [],
  children,
  // Header fijo: el contenedor se vuelve scrolleable (vertical + horizontal) con
  // altura máxima y el thead queda sticky. Default off → no afecta a otras tablas.
  stickyHeader = false,
  maxHeightClass = "max-h-[70dvh]",
  scrollId,
}) {
  const { theme } = useSunmiTheme();
  const theadBase = theme.table?.headerClass || "sunmi-thead";

  return (
    <div
      id={scrollId}
      className={stickyHeader ? `overflow-auto ${maxHeightClass}` : "overflow-x-auto"}
    >
      <table
        className="
          w-full
          text-[12px]
          table-auto
        "
      >
        {/* ===== HEADER ===== */}
        {headers.length > 0 && (
          <thead className={stickyHeader ? `${theadBase} sticky top-0 z-20` : theadBase}>
            <tr>
              {headers.map((h, i) => {
                const label = typeof h === "string" ? h : h.label;
                const extra = typeof h === "string" ? "" : (h.className || "");
                return (
                  <th
                    key={i}
                    className={`px-2 py-1.5 text-left font-semibold whitespace-nowrap ${extra}`}
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}

        {/* ===== BODY ===== */}
        <tbody
          className="divide-y sunmi-divide"
        >
          {children}
        </tbody>
      </table>
    </div>
  );
}
