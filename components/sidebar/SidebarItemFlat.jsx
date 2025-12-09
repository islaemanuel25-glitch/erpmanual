"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";

export default function SidebarItemFlat({ item, isHorizontal = false }) {
  const pathname = usePathname();
  const { sidebarMode } = useSidebarConfig();
  const { ui } = useUIConfig();
  const showText = sidebarMode === "icons-text";
  const Icon = item.icon;
  const active = pathname.startsWith(item.href);

  const iconSize = showText
    ? parseInt(ui.helpers.icon(1.125))
    : parseInt(ui.helpers.icon(1.375));

  return (
    <Link
      href={item.href}
      className="flex items-center transition-colors flex-shrink-0"
      style={{
        backgroundColor: active ? "var(--sunmi-table-row-bg)" : "transparent",
        color: active ? "var(--sunmi-header-text)" : "var(--sunmi-sidebar-text)",
        borderRadius: ui.helpers.radius("md"),
        ...(showText
          ? {
              paddingLeft: ui.helpers.spacing("md"),
              paddingRight: ui.helpers.spacing("md"),
              paddingTop: ui.helpers.spacing("sm"),
              paddingBottom: ui.helpers.spacing("sm"),
              gap: ui.helpers.spacing("md"),
            }
          : {
              padding: ui.helpers.spacing("sm"),
              justifyContent: "center",
            }),
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
          e.currentTarget.style.filter = "brightness(1.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.filter = "brightness(1)";
        }
      }}
      title={!showText ? item.label : undefined}
    >
      <Icon size={iconSize} />
      {showText && (
        <span
          className="font-medium"
          style={{
            fontSize: ui.helpers.font("sm"),
          }}
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

