"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiListItem({
  label,
  description,
  left = null,
  right = null,
  onClick,
  clickable = false,
  className = "",
}) {
  const { ui } = useUIConfig();

  return (
    <div
      className={`flex items-center justify-between ${clickable ? "cursor-pointer" : ""} ${className}`}
      onClick={clickable ? onClick : undefined}
      style={{
        gap: ui.helpers.spacing("md"),
        paddingTop: ui.helpers.spacing("sm"),
        paddingBottom: ui.helpers.spacing("sm"),
        backgroundColor: "transparent",
        transition: clickable ? "background-color 0.2s" : "none",
      }}
      onMouseEnter={(e) => {
        if (clickable) {
          e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <div
        className="flex items-start min-w-0"
        style={{
          gap: ui.helpers.spacing("sm"),
        }}
      >
        {left && <div style={{ marginTop: "2px" }}>{left}</div>}
        <div className="flex flex-col min-w-0">
          <span
            className="truncate"
            style={{
              color: "var(--sunmi-text)",
              fontSize: ui.helpers.font("sm"),
            }}
          >
            {label}
          </span>
          {description && (
            <span
              className="truncate"
              style={{
                color: "#94a3b8", // slate-400
                fontSize: ui.helpers.font("xs"),
              }}
            >
              {description}
            </span>
          )}
        </div>
      </div>

      {right && (
        <div
          className="flex items-center shrink-0"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}
