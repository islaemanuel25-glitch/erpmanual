"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingCart, Layers, Settings, Menu } from "lucide-react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

const TOPBAR_SHORTCUTS = [
  { key: "inicio", label: "Inicio", icon: Home, href: "/modulos/dashboard" },
  { key: "pos-ventas", label: "POS Ventas", icon: ShoppingCart, href: "/modulos/pos-ventas" },
  { key: "stock", label: "Stock", icon: Layers, href: "/modulos/stock_locales" },
  { key: "config", label: "Config", icon: Settings, href: "/modulos/configuracion" },
];

export default function TopbarNav({ onOpenMenu }) {
  const { theme } = useSunmiTheme();
  const pathname = usePathname();

  const btnClasses = (activo) => `
    flex items-center gap-1.5 px-3 py-1.5
    text-[12px] font-medium rounded-lg
    transition whitespace-nowrap
    ${activo
      ? `${theme.sidebar.iconActive} bg-white/10`
      : `${theme.sidebar.icon} ${theme.sidebar.hover}`
    }
  `;

  return (
    <nav
      className={`
        hidden md:flex items-center justify-between
        w-full px-3 h-[44px]
        border-b
        ${theme.sidebar.bg}
        ${theme.sidebar.border}
      `}
    >
      <div className="flex items-center gap-0.5">
        {TOPBAR_SHORTCUTS.map((s) => {
          const activo = pathname.startsWith(s.href);
          return (
            <Link key={s.key} href={s.href} className={btnClasses(activo)}>
              <s.icon size={14} />
              {s.label}
            </Link>
          );
        })}
      </div>

      <button
        onClick={onOpenMenu}
        className={`
          flex items-center gap-1.5 px-3 py-1.5
          text-[12px] font-medium rounded-lg
          transition cursor-pointer
          ${theme.sidebar.icon} ${theme.sidebar.hover}
        `}
      >
        <Menu size={16} />
        Menú
      </button>
    </nav>
  );
}
