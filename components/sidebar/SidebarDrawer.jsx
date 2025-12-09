"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";
import sidebarItems from "./sidebarItems";
import sidebarGroups from "./sidebarGroups";

export default function SidebarDrawer({ onClose }) {
  const pathname = usePathname();
  const { theme } = useSunmiTheme();
  const { sidebarMode, sidebarGroup } = useSidebarConfig();
  const { ui } = useUIConfig();

  const showText = sidebarMode === "icons-text";
  const isGrouped = sidebarGroup === "grouped";

  const drawerWidth = parseInt(ui.helpers.controlHeight()) * 8;
  const iconSize = parseInt(ui.helpers.icon(1.125));

  return (
    <div
      className={cn(
        "h-full flex flex-col shadow-xl",
        theme.sidebar?.bg ?? "bg-slate-900",
        theme.sidebar?.text ?? "text-slate-200"
      )}
      style={{
        width: `${drawerWidth}px`,
      }}
    >
      {/* HEADER */}
      <div
        className={cn(
          "flex items-center justify-between border-b",
          theme.sidebar?.border ? `border-b ${theme.sidebar.border}` : "border-b border-slate-700"
        )}
        style={{
          paddingLeft: ui.helpers.spacing("lg"),
          paddingRight: ui.helpers.spacing("lg"),
          height: ui.helpers.controlHeight(),
          borderBottomWidth: ui.helpers.line(),
        }}
      >
        <span
          className={cn("font-semibold", theme.sidebar?.text ?? "text-slate-200")}
          style={{
            fontSize: ui.helpers.font("base"),
          }}
        >
          Menú
        </span>
        <button
          onClick={onClose}
          className={cn(
            "transition",
            theme.sidebar?.text ?? "text-slate-200",
            "hover:bg-slate-700"
          )}
          style={{
            padding: ui.helpers.spacing("xs"),
            borderRadius: ui.helpers.radius("sm"),
          }}
        >
          <X size={iconSize} />
        </button>
      </div>

      {/* ITEMS */}
      <nav
        className="flex-1 overflow-y-auto"
        style={{
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
        }}
      >
        {isGrouped ? (
          // Modo agrupado
          sidebarGroups.map((group) => (
            <div
              key={group.id}
              style={{
                marginBottom: ui.helpers.spacing("lg"),
              }}
            >
              <h3
                className={cn(
                  "font-bold uppercase tracking-wide",
                  theme.sidebar?.text ?? "text-slate-400"
                )}
                style={{
                  fontSize: ui.helpers.font("xs"),
                  paddingLeft: ui.helpers.spacing("lg"),
                  paddingRight: ui.helpers.spacing("lg"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                {group.label}
              </h3>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center transition-colors",
                      active
                        ? "bg-amber-500 text-black"
                        : cn(
                            theme.sidebar?.text ?? "text-slate-200",
                            "hover:bg-slate-700"
                          )
                    )}
                    style={{
                      gap: ui.helpers.spacing("sm"),
                      paddingLeft: ui.helpers.spacing("lg"),
                      paddingRight: ui.helpers.spacing("lg"),
                      paddingTop: ui.helpers.spacing("sm"),
                      paddingBottom: ui.helpers.spacing("sm"),
                      fontSize: ui.helpers.font("sm"),
                    }}
                  >
                    <Icon size={iconSize} />
                    {showText && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))
        ) : (
          // Modo plano
          sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center transition-colors",
                  active
                    ? "bg-amber-500 text-black"
                    : cn(
                        theme.sidebar?.text ?? "text-slate-200",
                        "hover:bg-slate-700"
                      )
                )}
                style={{
                  gap: ui.helpers.spacing("sm"),
                  paddingLeft: ui.helpers.spacing("lg"),
                  paddingRight: ui.helpers.spacing("lg"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  fontSize: ui.helpers.font("sm"),
                }}
              >
                <Icon size={iconSize} />
                {showText && <span>{item.label}</span>}
              </Link>
            );
          })
        )}
      </nav>
    </div>
  );
}
