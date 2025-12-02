"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { cn } from "@/lib/utils";

export default function SunmiTable({ headers = [], children }) {
  const { theme } = useSunmiTheme();
  const t = theme.table;

  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          `
            w-full
            text-[12px]          /* compacto */
            table-fixed
          `
        )}
      >

        {/* ========== HEADER ========== */}
        {headers.length > 0 && (
          <thead className={cn(t.header)}>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={cn(`
                    px-2 py-1.5
                    text-left
                    font-semibold
                    whitespace-nowrap
                  `)}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}

        {/* ========== BODY ========== */}
        <tbody className={cn(`divide-y`, t.border)}>
          {children}
        </tbody>

      </table>
    </div>
  );
}
