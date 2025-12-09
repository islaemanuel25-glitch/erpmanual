"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useSidebarConfig } from "@/components/providers/SidebarConfigProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { cn } from "@/lib/utils";
import sidebarItems from "./sidebarItems";
import sidebarGroups from "./sidebarGroups";

export default function SidebarDrawer({ onClose }) {
  const pathname = usePathname();
  const { sidebarMode, sidebarGroup } = useSidebarConfig();
  const { ui } = useUIConfig();

  const showText = sidebarMode === "icons-text";
  const isGrouped = sidebarGroup === "grouped";

  const drawerWidth = parseInt(ui.helpers.controlHeight()) * 8;
  const iconSize = parseInt(ui.helpers.icon(1.125));

  return (
    <div
      className="h-full flex flex-col shadow-xl"
      style={{
        backgroundColor: "var(--sunmi-sidebar-bg)",
        color: "var(--sunmi-sidebar-text)",
        width: `${drawerWidth}px`,
      }}
    >
      {/* HEADER */}
      <div
        className="flex items-center justify-between border-b"
        style={{
          borderBottomColor: "var(--sunmi-sidebar-border)",
          borderBottomWidth: ui.helpers.line(),
          paddingLeft: ui.helpers.spacing("lg"),
          paddingRight: ui.helpers.spacing("lg"),
          height: ui.helpers.controlHeight(),
        }}
      >
        <span
          className="font-semibold"
          style={{
            color: "var(--sunmi-sidebar-text)",
            fontSize: ui.helpers.font("base"),
          }}
        >
          Menú
        </span>
        <button
          onClick={onClose}
          className="transition"
          style={{
            color: "var(--sunmi-sidebar-text)",
            padding: ui.helpers.spacing("xs"),
            borderRadius: ui.helpers.radius("sm"),
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
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
                className="font-bold uppercase tracking-wide"
                style={{
                  color: "var(--sunmi-sidebar-text)",
                  opacity: 0.7,
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
                    className="flex items-center transition-colors"
                    style={{
                      backgroundColor: active ? "var(--sunmi-header-text)" : "transparent",
                      color: active ? "#0f172a" : "var(--sunmi-sidebar-text)",
                      gap: ui.helpers.spacing("sm"),
                      paddingLeft: ui.helpers.spacing("lg"),
                      paddingRight: ui.helpers.spacing("lg"),
                      paddingTop: ui.helpers.spacing("sm"),
                      paddingBottom: ui.helpers.spacing("sm"),
                      fontSize: ui.helpers.font("sm"),
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
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
                className="flex items-center transition-colors"
                style={{
                  backgroundColor: active ? "var(--sunmi-header-text)" : "transparent",
                  color: active ? "#0f172a" : "var(--sunmi-sidebar-text)",
                  gap: ui.helpers.spacing("sm"),
                  paddingLeft: ui.helpers.spacing("lg"),
                  paddingRight: ui.helpers.spacing("lg"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  fontSize: ui.helpers.font("sm"),
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
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
