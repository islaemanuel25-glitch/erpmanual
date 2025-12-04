"use client";

import { Bell, ChevronDown, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useUser } from "@/app/context/UserContext";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function Header() {
  const pathname = usePathname();
  const menuRef = useRef(null);
  const { perfil, logout } = useUser();
  const { theme, themeKey, setThemeKey } = useSunmiTheme();
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

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 🔥 FIX PRINCIPAL — usar ui.density
  const headerHeight = ui.density.inputHeight * 1.8;

  return (
    <header
      className={`
        flex items-center justify-between
        border-b
        ${theme.header.bg}
        ${theme.header.border}
        ${theme.header.text}
      `}
      style={{
        height: headerHeight,
        paddingInline: ui.spacingScale[ui.spacing],
        boxShadow: ui.shadows.lg,
      }}
    >
      <h1
        className="hidden md:block font-semibold"
        style={{
          fontSize: ui.font.sizes.lg.fontSize,
          lineHeight: ui.font.sizes.lg.lineHeight,
        }}
      >
        {titulo}
      </h1>

      <div className="flex items-center" style={{ gap: ui.gap }}>
        <Bell size={ui.density.iconSize} className="cursor-pointer" style={{ opacity: 0.8 }} />

        <select
          onChange={(e) => setThemeKey(e.target.value)}
          value={themeKey}
          className={`
            ${theme.navbar?.bg || "bg-slate-900"}
            ${theme.navbar?.text || "text-slate-200"}
            ${theme.navbar?.border || "border-slate-700"}
            border
            focus:outline-none
            cursor-pointer
          `}
          style={{
            fontSize: ui.font.sizes.sm.fontSize,
            paddingInline: ui.spacingScale.xs,
            paddingBlock: ui.spacingScale.xs / 2,
            borderRadius: ui.roundedScale[ui.rounded],
          }}
        >
          <option value="sunmiDark">Dark</option>
          <option value="sunmiDarkCompact">Compact</option>
          <option value="sunmiLight">Light</option>
        </select>

        <div className="relative" ref={menuRef}>
          <div
            onClick={() => setOpen(!open)}
            className="flex items-center cursor-pointer select-none"
            style={{ gap: ui.gap / 2 }}
          >
            <div
              className={`
                flex items-center justify-center
                border
                ${theme.userCell?.avatarBg || "bg-slate-800"}
                ${theme.userCell?.avatarText || "text-yellow-300"}
              `}
              style={{
                width: ui.density.avatarSize,
                height: ui.density.avatarSize,
                borderRadius: ui.roundedScale.full,
                fontSize: ui.font.sizes.sm.fontSize,
                fontWeight: ui.font.weightBold,
                boxShadow: ui.shadows.sm,
              }}
            >
              {nombre[0]?.toUpperCase() || "?"}
            </div>

            <div className="flex flex-col" style={{ lineHeight: 1.1 }}>
              <span style={{ fontSize: ui.font.sizes.sm.fontSize, fontWeight: 500 }}>
                {nombre}
              </span>

              <span
                className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
                style={{
                  fontSize: ui.font.sizes.xs.fontSize,
                  paddingInline: ui.spacingScale.xs,
                  paddingBlock: ui.spacingScale.xs / 3,
                  borderRadius: ui.roundedScale[ui.rounded],
                  width: "fit-content",
                }}
              >
                {rol}
              </span>
            </div>

            <ChevronDown
              size={ui.density.iconSize}
              className={open ? "rotate-180 transition-transform" : "transition-transform"}
              style={{ opacity: 0.8 }}
            />
          </div>

          {open && (
            <div
              className={theme.card}
              style={{
                position: "absolute",
                right: 0,
                marginTop: ui.spacingScale.xs,
                width: 220,
                borderRadius: ui.roundedScale[ui.rounded],
                boxShadow: ui.shadows.lg,
                paddingBlock: ui.spacingScale.xs,
              }}
            >
              <div
                style={{
                  paddingInline: ui.spacingScale[ui.spacing],
                  paddingBlock: ui.spacingScale.xs,
                }}
              >
                <p style={{ fontSize: ui.font.sizes.sm.fontSize, fontWeight: 600 }}>{nombre}</p>
                <p style={{ fontSize: ui.font.sizes.xs.fontSize, opacity: 0.7 }}>{rol}</p>
              </div>

              <div
                style={{
                  borderTop: `${ui.borders.thin}px solid rgba(148,163,184,0.4)`,
                  marginBlock: ui.spacingScale.xs,
                }}
              />

              <button
                onClick={logout}
                className="flex items-center w-full text-left text-red-400"
                style={{
                  gap: ui.gap / 2,
                  paddingInline: ui.spacingScale[ui.spacing],
                  paddingBlock: ui.spacingScale.xs,
                  fontSize: ui.font.sizes.sm.fontSize,
                }}
              >
                <LogOut size={ui.density.iconSize} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
