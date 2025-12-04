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
      style={{
        transform: `scale(${ui.scale})`,
      }}
    >
      <table
        className={cn("table-fixed")}
        style={{
          width: "100%",
          fontSize: ui.fontSize,
          lineHeight: `${ui.fontLineHeight}px`,
        }}
      >
        {headers.length > 0 && (
          <thead className={cn(t.header)}>
            <tr>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={cn("text-left font-semibold whitespace-nowrap")}
                  style={{
                    paddingLeft: ui.spacingScale[ui.spacing],
                    paddingRight: ui.spacingScale[ui.spacing],
                    paddingTop: ui.spacingScale.xs,
                    paddingBottom: ui.spacingScale.xs,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}

        <tbody
          className={cn("divide-y", t.border)}
          style={{
            fontSize: ui.fontSizeSm || ui.fontSize,
            lineHeight: `${ui.fontLineHeight}px`,
          }}
        >
          {children}
        </tbody>
      </table>
    </div>
  );
}
