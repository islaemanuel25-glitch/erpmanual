"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useMenu } from "@/hooks/useMenu";

const MAX_TOPBAR = 8;

export default function TopbarNav() {
  const { theme } = useSunmiTheme();
  const { menu } = useMenu();
  const pathname = usePathname();
  const [openKey, setOpenKey] = useState(null);
  const navRef = useRef(null);

  // Cerrar al click fuera del nav o de un dropdown abierto
  useEffect(() => {
    if (!openKey) return;
    const handler = (e) => {
      const target = e.target;
      const inNav = navRef.current && navRef.current.contains(target);
      const inPanel = !!target.closest?.("[data-topbar-dropdown]");
      if (!inNav && !inPanel) setOpenKey(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openKey]);

  // Cerrar al cambiar de ruta
  useEffect(() => {
    setOpenKey(null);
  }, [pathname]);

  const accesos = (menu || []).slice(0, MAX_TOPBAR);

  return (
    <nav
      ref={navRef}
      className={`
        hidden md:flex items-center
        w-full px-3 h-[44px]
        border-b
        ${theme.sidebar.bg}
        ${theme.sidebar.border}
      `}
    >
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {accesos.map((g) => (
          <TopbarGroup
            key={g.key}
            group={g}
            isOpen={openKey === g.key}
            onToggle={() =>
              setOpenKey((cur) => (cur === g.key ? null : g.key))
            }
            onSelect={() => setOpenKey(null)}
            pathname={pathname}
            theme={theme}
          />
        ))}
      </div>
    </nav>
  );
}

function TopbarGroup({ group, isOpen, onToggle, onSelect, pathname, theme }) {
  const Icon = group.icon;
  const items = Array.isArray(group.items) ? group.items : [];
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Direct-link cases:
  //  - exactly 1 visible subitem → navega al subitem
  //  - 0 subitems pero group.href (ej. core "Inicio") → navega al group.href
  const directHref =
    items.length === 1
      ? items[0].href
      : items.length === 0 && group.href
      ? group.href
      : null;

  const activo = directHref
    ? pathname.startsWith(directHref)
    : items.some((i) => i.href && pathname.startsWith(i.href));

  const baseBtn = `
    flex items-center gap-1.5 px-3 py-1.5
    text-[12px] font-medium rounded-lg
    transition whitespace-nowrap
  `;

  const stateBtn = activo
    ? `${theme.sidebar.iconActive} bg-white/10`
    : `${theme.sidebar.icon} ${theme.sidebar.hover}`;

  // Posicionamiento fixed del panel (escapa al overflow-x-auto del contenedor).
  // Clampea `left` para evitar que el panel se salga del viewport por la derecha
  // (caso típico: dropdown de Configuración en 1280/1366px).
  useEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const PANEL_MIN_W = 220;
    const SAFE_MARGIN = 12;
    const update = () => {
      const rect = btnRef.current.getBoundingClientRect();
      const maxLeft = window.innerWidth - PANEL_MIN_W - SAFE_MARGIN;
      const left = Math.max(SAFE_MARGIN, Math.min(rect.left, maxLeft));
      setPos({ top: rect.bottom + 4, left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isOpen]);

  if (directHref) {
    return (
      <Link
        href={directHref}
        className={`${baseBtn} ${stateBtn}`}
        onClick={onSelect}
      >
        {Icon && <Icon size={14} />}
        {group.label}
      </Link>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={onToggle}
        className={`${baseBtn} ${stateBtn} cursor-pointer`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {Icon && <Icon size={14} />}
        {group.label}
      </button>

      {isOpen && (
        <div
          data-topbar-dropdown
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className={`
            ${theme.sidebar.dropdownBg}
            ${theme.sidebar.dropdownBorder} border
            rounded-xl shadow-xl shadow-black/40
            p-2 min-w-[220px] z-50
            max-h-[calc(100dvh-3rem)] overflow-y-auto
          `}
        >
          <h3
            className={`
              ${theme.sidebar.dropdownHeading}
              text-[10px] font-bold uppercase tracking-wide
              px-2 pt-1 pb-2
            `}
          >
            {group.label}
          </h3>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={onSelect}
              className={`
                block text-[13px] px-2 py-1.5 rounded-md transition
                ${theme.sidebar.dropdownItem}
                ${theme.sidebar.dropdownItemHover}
              `}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
