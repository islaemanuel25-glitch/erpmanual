"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";

export default function SunmiTable({ headers = [], children }) {
  const { theme } = useSunmiTheme();
  
  return (
    <div className="overflow-x-auto">
      <table
        className="
          w-full 
          text-[12px]              /* más compacto */
          table-fixed
        "
      >
        {/* ===== HEADER ===== */}
        {headers.length > 0 && (
          <thead className={theme.table?.header || "bg-amber-400 text-slate-900"}>
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
          className="
            divide-y divide-slate-800
          "
        >
          {children}
        </tbody>
      </table>
    </div>
  );
}
