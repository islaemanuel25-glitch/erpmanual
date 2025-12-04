"use client";

import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import SidebarPro from "@/components/sidebar/SidebarPro";
import { useUser } from "@/app/context/UserContext";
import { ChevronDown, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function NavbarPro() {
  const { theme } = useSunmiTheme();
  const pathname = usePathname();
  const { perfil, logout } = useUser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const { ui } = useUIConfig();

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

  const navHeight = ui.inputHeight * 1.6;

  return (
    <nav
      className={`
        flex items-center justify-between
        border-b
        ${theme.navbar?.bg || "bg-slate-900"}
        ${theme.navbar?.border || "border-slate-800"}
      `}
      style={{
        height: navHeight,
        paddingInline: ui.spacingScale[ui.spacing],
      }}
    >
      <div
        className={theme.navbar?.text || "text-slate-200"}
        style={{
          fontSize: ui.fontSizeLg,
          fontWeight: 600,
        }}
      >
        {titulo}
      </div>

      <div className="hidden md:flex items-center" style={{ gap: ui.gap }}>
        <SidebarPro mode="horizontal" />
      </div>

      <div className="relative" ref={menuRef}>
        <div
          onClick={() => setOpen(!open)}
          className="flex items-center cursor-pointer"
          style={{ gap: ui.gap / 2 }}
        >
          <div
            className={`
              flex items-center justify-center
              ${theme.userCell.avatarBg}
              ${theme.userCell.avatarText}
            `}
            style={{
              width: ui.avatarSize,
              height: ui.avatarSize,
              borderRadius: ui.roundedScale.full,
              fontSize: ui.fontSizeSm,
              fontWeight: ui.fontWeightBold,
            }}
          >
            {nombre[0]?.toUpperCase()}
          </div>

          <ChevronDown
            size={ui.iconSize}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </div>

        {open && (
          <div
            className={theme.card}
            style={{
              position: "absolute",
              right: 0,
              marginTop: ui.spacingScale.xs,
              width: 200,
              borderRadius: ui.roundedScale[ui.rounded || "md"],
              boxShadow: ui.shadowLg,
            }}
          >
            <div
              style={{
                paddingInline: ui.spacingScale[ui.spacing],
                paddingBlock: ui.spacingScale.xs,
              }}
            >
              <p style={{ fontSize: ui.fontSizeSm, fontWeight: 600 }}>{nombre}</p>
              <p style={{ fontSize: ui.fontSizeXs, opacity: 0.7 }}>{rol}</p>
            </div>

            <div
              style={{
                borderTop: `${ui.borderThin}px solid rgba(148,163,184,0.4)`,
              }}
            />

            <button
              onClick={logout}
              className="flex items-center w-full text-left text-red-400"
              style={{
                gap: ui.gap / 2,
                paddingInline: ui.spacingScale[ui.spacing],
                paddingBlock: ui.spacingScale.xs,
                fontSize: ui.fontSizeSm,
              }}
            >
              <LogOut size={ui.iconSize} />
              <span>Cerrar sesión</span>
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
