"use client";

import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiSection({
  title,
  description,
  children,
  footer = null,
  noSeparator = false,
  className = "",
}) {
  const { ui } = useUIConfig();
  
  return (
    <section
      className={`flex flex-col ${className}`}
      style={{
        gap: ui.helpers.spacing("md"),
      }}
    >
      {title && (
        <div
          className="flex flex-col"
          style={{
            gap: ui.helpers.spacing("xs"),
          }}
        >
          <div
            className="flex items-center justify-between"
            style={{
              gap: ui.helpers.spacing("sm"),
            }}
          >
            <h3
              className="font-semibold"
              style={{
                color: "var(--sunmi-text)",
                fontSize: ui.helpers.font("sm"),
              }}
            >
              {title}
            </h3>
          </div>
          {description && (
            <p
              style={{
                color: "#94a3b8", // slate-400
                fontSize: ui.helpers.font("xs"),
              }}
            >
              {description}
            </p>
          )}
        </div>
      )}

      {!noSeparator && <SunmiSeparator />}

      <div
        className="flex flex-col"
        style={{
          gap: ui.helpers.spacing("sm"),
        }}
      >
        {children}
      </div>

      {footer && (
        <div
          style={{
            marginTop: ui.helpers.spacing("xs"),
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}
