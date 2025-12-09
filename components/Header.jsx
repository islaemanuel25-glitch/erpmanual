"use client";

import { Bell, ChevronDown, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useUser } from "@/app/context/UserContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useLayoutMode } from "@/components/providers/LayoutModeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SidebarTop from "@/components/sidebar/SidebarTop";

export default function Header() {
  const pathname = usePathname();
  const menuRef = useRef(null);
  const { perfil, logout } = useUser();
  const { theme } = useSunmiTheme();
  const { layoutMode } = useLayoutMode();
  const { ui } = useUIConfig();

  const [open, setOpen] = useState(false);

  const nombre = perfil?.nombre || "Usuario";
  const rol = perfil?.rol || "-";

  const titulo =
    pathname.includes("usuarios")
      ? "Usuarios"
      : pathname.includes("roles")
      ? "Roles"
      : pathname.includes("locales")
      ? "Locales"
      : pathname.includes("productos")
      ? "Productos"
      : pathname.includes("stock")
      ? "Stock"
      : pathname.includes("transferencias")
      ? "Transferencias"
      : pathname.includes("pos")
      ? "POS"
      : "Panel";

  // Close menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const headerHeight = ui.helpers.controlHeight();
  const avatarSize = parseInt(headerHeight) * 0.9;
  const iconSize = parseInt(ui.helpers.icon(1.125));
  const chevronSize = parseInt(ui.helpers.icon(1.125));

  return (
    <header
      className={`w-full flex items-center justify-between border-b shadow-md bg-gradient-to-r ${theme.header.bg} ${theme.header.border}`}
      style={{
        height: headerHeight,
        paddingLeft: ui.helpers.spacing("lg"),
        paddingRight: ui.helpers.spacing("lg"),
        borderBottomWidth: ui.helpers.line(),
      }}
    >
      {/* --- SI LAYOUT ES TOP, AQUI VA EL MENÚ --- */}
      {layoutMode === "sidebar-top" && (
        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("sm"),
            marginRight: ui.helpers.spacing("lg"),
          }}
        >
          <SidebarTop />
        </div>
      )}

      {/* --- TITULO --- */}
      <h1
        className={`font-semibold hidden md:block ${theme.header.text}`}
        style={{
          fontSize: ui.helpers.font("lg"),
        }}
      >
        {titulo}
      </h1>

      {/* --- DERECHA --- */}
      <div
        className="flex items-center"
        style={{
          gap: parseInt(ui.helpers.spacing("lg")) * 1.5,
        }}
      >
        <Bell
          className={`${theme.header.text} cursor-pointer`}
          size={iconSize}
        />

        {/* Perfil */}
        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setOpen(!open)}
            className="flex items-center cursor-pointer"
            style={{
              gap: ui.helpers.spacing("sm"),
            }}
          >
            <div
              className={`rounded-full flex items-center justify-center font-bold ${theme.card}`}
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: ui.helpers.radius("full"),
                fontSize: ui.helpers.font("sm"),
              }}
            >
              {nombre[0]}
            </div>

            <div
              className="flex flex-col"
              style={{
                lineHeight: 1.2,
              }}
            >
              <span
                className={theme.header.text}
                style={{
                  fontSize: ui.helpers.font("sm"),
                }}
              >
                {nombre}
              </span>
              <span
                className={`border ${theme.header.text} ${theme.header.border}`}
                style={{
                  fontSize: ui.helpers.font("xs"),
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("xs"),
                  paddingBottom: ui.helpers.spacing("xs"),
                  borderRadius: ui.helpers.radius("md"),
                  borderWidth: ui.helpers.line(),
                }}
              >
                {rol}
              </span>
            </div>

            <ChevronDown
              size={chevronSize}
              className={`${theme.header.text} transition-transform ${open ? "rotate-180" : ""}`}
            />
          </div>

          {open && (
            <div
              className={`absolute right-0 shadow-xl border ${theme.card} ${theme.header.border}`}
              style={{
                marginTop: ui.helpers.spacing("sm"),
                width: parseInt(ui.helpers.controlHeight()) * 14.5,
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                borderRadius: ui.helpers.radius("md"),
                borderWidth: ui.helpers.line(),
              }}
            >
              <button
                onClick={logout}
                className="flex items-center text-red-400 hover:bg-red-500/10"
                style={{
                  gap: ui.helpers.spacing("sm"),
                  paddingLeft: ui.helpers.spacing("lg"),
                  paddingRight: ui.helpers.spacing("lg"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  fontSize: ui.helpers.font("sm"),
                }}
              >
                <LogOut size={parseInt(ui.helpers.icon(1))} /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
