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
  {
    label: "POS",
    href: "/modulos/pos-ventas",
    icon: ShoppingCart,
    color: "blue",
  },
  {
    label: "Stock",
    href: "/modulos/stock_locales",
    icon: Layers,
    color: "orange",
  },
  {
    label: "Clientes",
    href: "/modulos/clientes",
    icon: Users,
    color: "green",
  },
  {
    label: "Reportes",
    href: "/modulos/reportes-ventas",
    icon: BarChart3,
    color: "purple",
  },
  {
    label: "Productos",
    href: "/modulos/productos",
    icon: Package,
    color: "sky",
  },
  {
    label: "Config",
    href: "/modulos/configuracion",
    icon: Settings,
    color: "red",
  },
];

const TILE_COLORS = {
  blue: "bg-blue-500/15 text-blue-600 dark:bg-blue-500/25 dark:text-blue-400",
  orange:
    "bg-amber-500/15 text-amber-600 dark:bg-amber-500/25 dark:text-amber-400",
  green:
    "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-400",
  purple:
    "bg-violet-500/15 text-violet-600 dark:bg-violet-500/25 dark:text-violet-400",
  sky: "bg-sky-400/15 text-sky-600 dark:bg-sky-400/25 dark:text-sky-400",
  red: "bg-red-500/15 text-red-600 dark:bg-red-500/25 dark:text-red-400",
};

export default function AccesosRapidos({ variant = "mobile" }) {
  const { theme } = useSunmiTheme();
  const isDesktop = variant === "desktop";

  if (isDesktop) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {ACCESOS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`
              ${theme.card}
              rounded-xl p-4
              flex flex-col items-center justify-center gap-2.5
              min-h-[96px]
              transition hover:opacity-90 active:scale-[0.98]
              border border-current/10
            `}
          >
            <div
              className={`
                w-12 h-12 rounded-xl flex items-center justify-center shrink-0
                ${TILE_COLORS[item.color] || TILE_COLORS.blue}
              `}
            >
              <item.icon size={24} strokeWidth={2} />
            </div>
            <span className="text-sm font-medium text-center leading-tight">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {ACCESOS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`
            ${theme.card}
            rounded-xl p-4
            flex flex-col items-center justify-center gap-2.5
            min-h-[88px]
            transition hover:opacity-90 active:scale-[0.98]
            border border-current/10
          `}
        >
          <div
            className={`
              w-11 h-11 rounded-xl flex items-center justify-center shrink-0
              ${TILE_COLORS[item.color] || TILE_COLORS.blue}
            `}
          >
            <item.icon size={22} strokeWidth={2} />
          </div>
          <span className="text-sm font-medium text-center leading-tight">
            {item.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
