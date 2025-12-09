"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiTable({ headers = [], children }) {
  const { ui } = useUIConfig();
  
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full table-fixed"
        style={{
          fontSize: ui.helpers.font("xs"),
        }}
      >
        {/* ===== HEADER ===== */}
        {headers.length > 0 && (
          <thead
            style={{
              backgroundColor: "var(--sunmi-table-header-bg)",
            }}
          >
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="text-left font-semibold whitespace-nowrap"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}

        {/* ===== BODY ===== */}
        <tbody className="divide-y divide-slate-800">
          {children}
        </tbody>
      </table>
    </div>
  );
}
