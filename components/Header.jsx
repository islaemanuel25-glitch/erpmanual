"use client";

import { Bell, ChevronDown, LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useUser } from "@/app/context/UserContext";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function Header({ position = "top" }) {
  // Validar position prop
  const validPosition = ["top", "bottom", "hidden"].includes(position)
    ? position
    : "top";

  const pathname = usePathname();
  const menuRef = useRef(null);
  const { perfil, logout } = useUser();
  const { ui } = useUIConfig();

  const [open, setOpen] = useState(false);

  // Si position es "hidden", no renderizar
  if (validPosition === "hidden") return null;

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
  const avatarSize = parseInt(headerHeight);
  const iconSize = parseInt(ui.helpers.icon(1.125));
  const chevronSize = parseInt(ui.helpers.icon(1.125));

  const isBottom = validPosition === "bottom";

  return (
    <header
      className="w-full flex items-center justify-between sticky top-0 z-30"
      style={{
        background: "var(--sunmi-header-bg)",
        borderColor: "var(--sunmi-header-border)",
        ...(isBottom
          ? {
              borderTopWidth: ui.helpers.line(),
              boxShadow: "0 -2px 6px rgba(0,0,0,0.25)",
            }
          : {
              borderBottomWidth: ui.helpers.line(),
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }),
        height: headerHeight,
        paddingLeft: ui.helpers.spacing("lg"),
        paddingRight: ui.helpers.spacing("lg"),
      }}
    >
      {/* --- TITULO --- */}
      <h1
        className="font-semibold hidden md:block"
        style={{
          color: "var(--sunmi-header-text)",
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
          className="cursor-pointer"
          style={{
            color: "var(--sunmi-header-text)",
          }}
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
              className="rounded-full flex items-center justify-center font-bold"
              style={{
                backgroundColor: "var(--sunmi-card-bg)",
                borderColor: "var(--sunmi-card-border)",
                borderWidth: "1px",
                color: "var(--sunmi-card-text)",
                width: avatarSize * 0.9,
                height: avatarSize * 0.9,
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
                style={{
                  color: "var(--sunmi-header-text)",
                  fontSize: ui.helpers.font("sm"),
                }}
              >
                {nombre}
              </span>
              <span
                className="border"
                style={{
                  color: "var(--sunmi-header-text)",
                  borderColor: "var(--sunmi-header-border)",
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
              className="transition-transform"
              style={{
                color: "var(--sunmi-header-text)",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </div>

          {open && (
            <div
              className="absolute right-0 shadow-xl border"
              style={{
                backgroundColor: "var(--sunmi-card-bg)",
                borderColor: "var(--sunmi-header-border)",
                borderWidth: ui.helpers.line(),
                marginTop: ui.helpers.spacing("sm"),
                width: parseInt(ui.helpers.controlHeight()) * 14.5,
                paddingTop: ui.helpers.spacing("sm"),
                paddingBottom: ui.helpers.spacing("sm"),
                borderRadius: ui.helpers.radius("md"),
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
