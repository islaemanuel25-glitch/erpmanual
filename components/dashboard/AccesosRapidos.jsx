"use client";

import Link from "next/link";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import {
  ShoppingCart,
  Layers,
  Users,
  BarChart3,
  Package,
  Settings,
} from "lucide-react";

const ACCESOS = [
  { label: "POS", href: "/modulos/pos-ventas", icon: ShoppingCart, color: "blue" },
  { label: "Stock", href: "/modulos/stock_locales", icon: Layers, color: "orange" },
  { label: "Clientes", href: "/modulos/clientes", icon: Users, color: "green" },
  { label: "Reportes", href: "/modulos/reportes-ventas", icon: BarChart3, color: "purple" },
  { label: "Productos", href: "/modulos/productos", icon: Package, color: "sky" },
  { label: "Config", href: "/modulos/configuracion", icon: Settings, color: "red" },
];

const TILE_BG = {
  blue: "bg-blue-500/[0.14] dark:bg-blue-400/[0.12]",
  orange: "bg-amber-500/[0.14] dark:bg-amber-400/[0.12]",
  green: "bg-emerald-500/[0.14] dark:bg-emerald-400/[0.12]",
  purple: "bg-violet-500/[0.14] dark:bg-violet-400/[0.12]",
  sky: "bg-sky-400/[0.14] dark:bg-sky-400/[0.12]",
  red: "bg-red-500/[0.14] dark:bg-red-400/[0.12]",
};

const TILE_ICON = {
  blue: "text-blue-600 dark:text-blue-400",
  orange: "text-amber-600 dark:text-amber-400",
  green: "text-emerald-600 dark:text-emerald-400",
  purple: "text-violet-600 dark:text-violet-400",
  sky: "text-sky-600 dark:text-sky-400",
  red: "text-red-600 dark:text-red-400",
};

export default function AccesosRapidos({ variant = "mobile" }) {
  const { theme } = useSunmiTheme();
  const isDesktop = variant === "desktop";

  const linkBase = `
    rounded-xl
    flex flex-col items-center justify-center
    transition-all duration-200
    hover:bg-current/[0.04] active:bg-current/[0.06]
    border border-current/[0.04]
    hover:border-current/[0.08]
  `;

  const cardStyle = `${theme.card} shadow-sm`;

  if (isDesktop) {
    return (
      <div className="grid grid-cols-3 gap-2.5 w-full">
        {ACCESOS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${cardStyle} ${linkBase} p-3.5 min-h-[84px] gap-2`}
          >
            <div
              className={`
                w-11 h-11 rounded-full flex items-center justify-center shrink-0
                ${TILE_BG[item.color] || TILE_BG.blue}
                ${TILE_ICON[item.color] || TILE_ICON.blue}
              `}
            >
              <item.icon size={22} strokeWidth={1.75} />
            </div>
            <span className="text-[13px] font-medium text-center leading-tight opacity-95">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5 w-full">
      {ACCESOS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${cardStyle} ${linkBase} p-3.5 min-h-[80px] gap-2`}
        >
          <div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center shrink-0
              ${TILE_BG[item.color] || TILE_BG.blue}
              ${TILE_ICON[item.color] || TILE_ICON.blue}
            `}
          >
            <item.icon size={20} strokeWidth={1.75} />
          </div>
          <span className="text-[13px] font-medium text-center leading-tight opacity-95">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
