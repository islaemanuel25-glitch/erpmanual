"use client";

import { Children } from "react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiList({
  children,
  className = "",
}) {
  const { ui } = useUIConfig();
  
  const childrenArray = Children.toArray(children);
  
  return (
    <div className={`flex flex-col ${className}`}>
      {childrenArray.map((child, idx) => (
        <div key={idx}>
          {child}
          {idx < childrenArray.length - 1 && (
            <div
              style={{
                borderTopColor: "var(--sunmi-card-border)",
                borderTopWidth: "1px",
                opacity: 0.8,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
