"use client";

import { useSunmiTheme } from "./SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SunmiTable({ headers = [], children }) {
  const { theme } = useSunmiTheme();
  const { ui } = useUIConfig();
  const t = theme.table;

  return (
    <div
      className="overflow-x-auto"
      style={{ transform: `scale(${ui.scale})` }}
    >
      <table
        className={cn(`
          w-full
          table-fixed
        `)}
        style={{
          fontSize: ui.font.fontSize,
          lineHeight: ui.font.lineHeight,
        }}
      >
        {headers.length > 0 && (
          <thead className={cn(t.header)}>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={cn(`
                    text-left
                    font-semibold
                    whitespace-nowrap
                  `)}
                  style={{
                    padding: ui.gap,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}

        <tbody
          className={cn(`divide-y`, t.border)}
          style={{
            fontSize: ui.font.fontSize,
            lineHeight: ui.font.lineHeight,
          }}
        >
          {children}
        </tbody>
      </table>
    </div>
  );
}
