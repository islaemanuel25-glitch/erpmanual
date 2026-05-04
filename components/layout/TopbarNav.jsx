"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { useMenu } from "@/hooks/useMenu";

const MAX_TOPBAR = 8;

export default function TopbarNav({ onOpenMenu }) {
  const { theme } = useSunmiTheme();
  const { menu } = useMenu();
  const pathname = usePathname();

  // Destino principal RBAC-safe: group.href solo si coincide con un ítem visible;
  // sino, primer ítem visible. Si no hay ítem visible, no renderiza el acceso.
  const accesos = menu
    .map((grupo) => {
      const visibles = grupo.items || [];
      const primer = visibles[0];
      if (!primer) return null;
      const principal = grupo.href && visibles.some((i) => i.href === grupo.href)
        ? grupo.href
        : primer.href;
      return {
        key: grupo.key,
        label: grupo.label,
        icon: grupo.icon,
        href: principal,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_TOPBAR);

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
      <div className="flex items-center gap-0.5 overflow-x-auto">
        {accesos.map((s) => {
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
