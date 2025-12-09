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
      className={cn(
        "flex items-center transition-colors flex-shrink-0",
        active
          ? "text-amber-400 bg-slate-800"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      )}
      style={{
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

